import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthFrame({
  title,
  lede,
  footnote,
  cardTitle,
  cardDescription,
  children,
}: {
  title: string;
  lede: string;
  footnote: string;
  cardTitle: string;
  cardDescription: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Link href="/login" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground text-sm font-semibold text-primary">
            ND
          </span>
          <span className="text-lg font-semibold tracking-tight">Notaryd</span>
        </Link>
        <div className="max-w-md space-y-4">
          <p className="text-sm font-medium text-primary-foreground/70">For teams shipping with agents</p>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="text-base text-primary-foreground/80">{lede}</p>
        </div>
        <p className="text-sm text-primary-foreground/70">{footnote}</p>
      </section>
      <section className="flex items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 lg:hidden">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                ND
              </span>
              <span className="font-semibold">Notaryd</span>
            </div>
            <CardTitle className="text-xl">
              <h2>{cardTitle}</h2>
            </CardTitle>
            <CardDescription>{cardDescription}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </section>
    </div>
  );
}
