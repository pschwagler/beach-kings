import { useState } from 'react';

/**
 * Hook to manage form submission state
 * Groups isSubmitting, formError, and showDeleteConfirm
 */
export function useFormSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return {
    isSubmitting,
    setIsSubmitting,
    formError,
    setFormError,
    showDeleteConfirm,
    setShowDeleteConfirm
  };
}


