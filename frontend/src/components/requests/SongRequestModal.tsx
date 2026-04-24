import React, { useState } from 'react';
import Modal from '../common/Modal';
import type { Track } from '../../types';
import RequestForm, { RequestFormValues } from './RequestForm';

export interface SongRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  onCreateRequest: (values: RequestFormValues) => Promise<boolean>;
  isSubmitting?: boolean;
}

const SongRequestModal: React.FC<SongRequestModalProps> = ({
  isOpen,
  onClose,
  tracks,
  onCreateRequest,
  isSubmitting: externalSubmitting,
}) => {
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const isSubmitting = externalSubmitting ?? localSubmitting;

  const handleSubmit = async (values: RequestFormValues) => {
    try {
      setLocalSubmitting(true);
      const wasCreated = await onCreateRequest(values);
      if (wasCreated) {
        onClose();
      }
    } finally {
      setLocalSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request a song">
      <RequestForm tracks={tracks} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Modal>
  );
};

export default SongRequestModal;

