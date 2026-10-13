'use client';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function AccountCredential({
  value,
  onChange,
  canReveal,
  revealing,
  onReveal,
}: {
  value: string;
  onChange: (value: string) => void;
  canReveal: boolean;
  revealing: boolean;
  onReveal: () => void;
}) {
  return (
    <Field label="Password or session JSON" htmlFor="credential">
      <Textarea
        id="credential"
        name="credential"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={canReveal ? 'Leave blank to keep the stored value' : ''}
        autoComplete="off"
      />
      {canReveal ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" aria-label="Reveal stored credential" disabled={revealing} onClick={onReveal}>
          {revealing ? 'Revealing…' : 'Reveal'}
        </Button>
      ) : null}
    </Field>
  );
}
