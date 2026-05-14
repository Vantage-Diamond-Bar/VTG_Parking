import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vantage Parking – Resident Registration',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
