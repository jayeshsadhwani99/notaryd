export type PrismaField = {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  isId: boolean;
  isRelation: boolean;
  column: string;
  relationFields: string[];
  references: string[];
};

export type PrismaModel = {
  name: string;
  table: string;
  fields: PrismaField[];
};

export type PrismaEnum = {
  name: string;
  values: string[];
};

function parseModel(name: string, body: string): PrismaModel {
  const fields: PrismaField[] = [];
  let table = name;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const map = line.match(/^@@map\(\s*"([^"]+)"\s*\)/);
    if (map) {
      table = map[1];
      continue;
    }
    if (line.startsWith('@@') || line.startsWith('@')) continue;
    const match = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!match) continue;
    const attr = match[5] ?? '';
    const column = attr.match(/@map\(\s*"([^"]+)"\s*\)/)?.[1] ?? match[1];
    const relationFields = [...attr.matchAll(/fields:\s*\[([^\]]*)\]/g)].flatMap((found) =>
      found[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    );
    const references = [...attr.matchAll(/references:\s*\[([^\]]*)\]/g)].flatMap((found) =>
      found[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    );
    fields.push({
      name: match[1],
      type: match[2],
      list: Boolean(match[3]),
      optional: Boolean(match[4]),
      isId: /@id\b/.test(attr),
      isRelation: false,
      column,
      relationFields,
      references,
    });
  }
  return { name, table, fields };
}

export function parsePrismaSchema(source: string): { models: PrismaModel[]; enums: PrismaEnum[] } {
  const cleaned = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const enums: PrismaEnum[] = [];
  const models: PrismaModel[] = [];
  const block = /\b(model|enum)\s+(\w+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = block.exec(cleaned))) {
    let depth = 1;
    let index = block.lastIndex;
    while (index < cleaned.length && depth > 0) {
      if (cleaned[index] === '{') depth += 1;
      else if (cleaned[index] === '}') depth -= 1;
      index += 1;
    }
    const body = cleaned.slice(block.lastIndex, index - 1);
    block.lastIndex = index;
    if (match[1] === 'enum') {
      enums.push({
        name: match[2],
        values: body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('@@') && !line.startsWith('@'))
          .map((line) => line.split(/\s+/)[0])
          .filter(Boolean),
      });
    } else {
      models.push(parseModel(match[2], body));
    }
  }
  const names = new Set(models.map((model) => model.name));
  for (const model of models) {
    for (const field of model.fields) {
      if (names.has(field.type)) field.isRelation = true;
    }
  }
  return { models, enums };
}

export type DeleteStep = {
  table: string;
  column: string;
  via: string;
  reason: string;
};

export function buildDeletePlan(models: PrismaModel[]): { userModel: string; steps: DeleteStep[] } | null {
  const user = models.find((model) => model.name === 'User') ?? null;
  if (!user) return null;
  const byName = new Map(models.map((model) => [model.name, model]));
  const direct = new Set<string>();
  const references = new Map<string, { model: string; column: string }[]>();

  for (const model of models) {
    if (model.name === user.name) continue;
    for (const field of model.fields) {
      if (field.isRelation && field.relationFields.length > 0) {
        const fk = field.relationFields[0];
        const fkField = model.fields.find((candidate) => candidate.name === fk);
        const list = references.get(model.name) ?? [];
        list.push({ model: field.type, column: fkField?.column || fk });
        references.set(model.name, list);
        if (field.type === user.name) direct.add(model.name);
      } else if (/^(user|owner|author)Id$/.test(field.name)) {
        direct.add(model.name);
        const list = references.get(model.name) ?? [];
        if (!list.some((item) => item.model === user.name && item.column === field.column)) {
          list.push({ model: user.name, column: field.column });
          references.set(model.name, list);
        }
      }
    }
  }

  const included = new Set(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const model of models) {
      if (included.has(model.name) || model.name === user.name) continue;
      const refs = references.get(model.name) ?? [];
      if (refs.some((ref) => included.has(ref.model))) {
        included.add(model.name);
        changed = true;
      }
    }
  }

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const name of included) {
    indegree.set(name, 0);
    children.set(name, []);
  }
  for (const name of included) {
    for (const ref of references.get(name) ?? []) {
      if (!included.has(ref.model)) continue;
      indegree.set(name, (indegree.get(name) ?? 0) + 1);
      children.get(ref.model)?.push(name);
    }
  }
  const parentFirst: string[] = [];
  const pending = new Map(indegree);
  const queue = [...included].filter((name) => (pending.get(name) ?? 0) === 0);
  while (queue.length > 0) {
    const name = queue.shift();
    if (!name) break;
    parentFirst.push(name);
    for (const child of children.get(name) ?? []) {
      pending.set(child, (pending.get(child) ?? 1) - 1);
      if (pending.get(child) === 0) queue.push(child);
    }
  }
  const ordered = parentFirst.reverse();
  for (const name of included) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  const steps = ordered.map((name) => {
    const model = byName.get(name);
    if (!model) {
      return { table: name, column: 'id', via: 'unknown', reason: `${name} is in the account graph` };
    }
    const refs = references.get(name) ?? [];
    const userRef = refs.find((ref) => ref.model === user.name);
    if (userRef) {
      return {
        table: model.table,
        column: userRef.column,
        via: 'direct',
        reason: `${model.name}.${userRef.column} points at ${user.name}`,
      };
    }
    const parent = refs.find((ref) => included.has(ref.model));
    return {
      table: model.table,
      column: parent?.column || 'id',
      via: parent?.model || 'unknown',
      reason: parent
        ? `${model.name}.${parent.column} points at ${parent.model}, which belongs to the account`
        : `${model.name} is in the account graph`,
    };
  });
  return { userModel: user.name, steps };
}
