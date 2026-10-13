import {
  AppWindow, Box, Building2, CreditCard, Database, FlaskConical, Globe, Layers, Package, Rocket,
  Shield, ShoppingCart, Store, Wallet, Workflow, Zap, type LucideIcon,
} from 'lucide-react';

export const projectIconNames = [
  'layers', 'box', 'shopping-cart', 'credit-card', 'rocket', 'database', 'globe', 'shield', 'zap',
  'package', 'app-window', 'building-2', 'workflow', 'flask', 'store', 'wallet',
] as const;

export type ProjectIconName = (typeof projectIconNames)[number];

export const projectIconMap: Record<ProjectIconName, LucideIcon> = {
  layers: Layers, box: Box, 'shopping-cart': ShoppingCart, 'credit-card': CreditCard, rocket: Rocket,
  database: Database, globe: Globe, shield: Shield, zap: Zap, package: Package, 'app-window': AppWindow,
  'building-2': Building2, workflow: Workflow, flask: FlaskConical, store: Store, wallet: Wallet,
};

export function isProjectIcon(value: string): value is ProjectIconName {
  return (projectIconNames as readonly string[]).includes(value);
}
