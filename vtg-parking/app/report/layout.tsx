import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Report a Violation – Vantage Parking',
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
