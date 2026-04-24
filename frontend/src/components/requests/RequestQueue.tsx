import React, { useMemo } from 'react';
import RequestCard from './RequestCard';
import type { SongRequest } from './types';
import type { RequestQueueFilter } from './requestStore';

export interface RequestQueueProps {
  requests: SongRequest[];
  filter: RequestQueueFilter;
  counts: Record<RequestQueueFilter, number>;
  onFilterChange: (filter: RequestQueueFilter) => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onPlay: (id: string) => void;
}

const RequestQueue: React.FC<RequestQueueProps> = ({
  requests,
  filter,
  counts,
  onFilterChange,
  onAccept,
  onDecline,
  onPlay,
}) => {
  const sorted = useMemo(() => [...requests], [requests]);
  const filterOptions: RequestQueueFilter[] = [
    'all',
    'pending',
    'accepted',
    'played',
    'declined',
    'expired',
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => {
          const isActive = option === filter;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onFilterChange(option)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                isActive
                  ? 'border-primary-blue bg-primary-blue/15 text-primary-blue'
                  : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500'
              }`}
            >
              {option} ({counts[option]})
            </button>
          );
        })}
      </div>

      {!sorted.length ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-sm text-slate-400">
          No song requests match this view yet.
        </div>
      ) : (
        <div className="space-y-2" data-testid="request-queue">
          {sorted.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onAccept={() => onAccept(req.id)}
              onDecline={() => onDecline(req.id)}
              onPlay={() => onPlay(req.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RequestQueue;

