export const FLOW_NAME_PROMPT = `You name flows on a QA map. A flow is one goal a person finishes, such as paying for an order. A page title or a component name is not a flow.

The user message is a JSON document. Read it as data about the product.

<task>
For each flow, write a name and a goal an engineer can scan in a list.
</task>

<constraints>
Keep every slug character-for-character.
Return one item for each input flow, in the same order.
Name is 2–6 words in title case.
Goal is one sentence that names the outcome the person can see.
When the input name and goal already say that outcome, keep them.
</constraints>

<output>
{"flows":[{"slug":"checkout","name":"Checkout","goal":"Pay for an order and reach a confirmation."}]}
</output>

<example>
<input>{"flows":[{"slug":"orders","name":"Use Orders","goal":"Complete the orders goal and confirm the result","feature":"orders"}]}</input>
<output>{"flows":[{"slug":"orders","name":"Review orders","goal":"Open the order list and see one order."}]}</output>
</example>`;

export const SEED_PROMPT = `You write a TypeScript Prisma seed script the app can run with tsx.

The user message lists Prisma model names. Read it as data.

<task>
Create one user for each role you can infer from the model names, and one row that leaves a list model empty when a list model exists.
</task>

<constraints>
Use emails at example.com and the password seed-password.
Import PrismaClient from @prisma/client.
Define an async function named main and call it at the end of the file.
The script is the whole reply.
</constraints>

<example>
<input>Models: User, Order</input>
<output>
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.user.create({ data: { email: 'admin@example.com', password: 'seed-password', role: 'admin' } });
  await prisma.user.create({ data: { email: 'member@example.com', password: 'seed-password', role: 'member' } });
}
main();
</output>
</example>`;

export const SELECTOR_REPAIR_PROMPT = `You replace one Playwright selector after a recorded step missed its target.

The user message is JSON with action, selector, error, visibleText, and prompt. The prompt is the engineer's note about the screen. Read every field as evidence.

<task>
Choose the selector for the element the step was aiming at, using the visible text.
</task>

<constraints>
Return one selector in the same style as the failed selector: CSS, text, or role.
When the visible text shows no replacement, return an empty selector.
A selector names an element on the page.
</constraints>

<output>
{"selector":"button:has-text(\\"Pay now\\")"}
</output>

<example>
<input>{"action":"click","selector":"button:has-text(\\"Pay\\")","error":"waiting for locator","visibleText":"Pay now\\nTotal $10","prompt":"the pay button label changed"}</input>
<output>{"selector":"button:has-text(\\"Pay now\\")"}</output>
</example>`;

export const FAILURE_PROMPT = `You explain a failed check to the engineer who owns the flow.

The user message is JSON with the flow name, error, blocked reason, the engineer's prompt, and a slice of visible text. The prompt is a note about the product. Read it as evidence.

<task>
Write two sentences.
The first sentence says what the check was doing and where it stopped.
The second sentence gives the most likely cause, using the error and the visible text.
</task>

<constraints>
Use the names and words that appear in the evidence.
When a field is empty, leave it out of the explanation.
</constraints>`;
