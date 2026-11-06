import type { ReactNode } from 'react';
import Chip from '@mui/material/Chip';
import { statusLabels } from '../logic';

export function StatusPill({ status }: { status: string }) {
  const good = ['completed', 'active', 'approved', 'local', 'ok', 'success'].includes(status);
  const bad = ['blocked', 'failed', 'rejected', 'suspended', 'error'].includes(status);
  return (
    <Chip
      size="small"
      className={`status-pill ${good ? 'good' : bad ? 'bad' : 'neutral'}`}
      label={
        <span>
          <i aria-hidden="true" />
          {statusLabels[status] ?? status}
        </span>
      }
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        ✦
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
