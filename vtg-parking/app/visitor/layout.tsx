import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vantage Parking – Visitor Parking',
};

export default function VisitorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
