import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vantage Parking – Patrol Portal',
};

export default function PatrolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
