import { useLayoutEffect, useRef, type RefObject } from 'react';
import { focusElement } from '@/utils/accessibility';
import useFocusTrap from './useFocusTrap';

interface UseModalA11yOptions<T extends HTMLElement> {
  isOpen: boolean;
  containerRef: RefObject<T>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  lockBodyScroll?: boolean;
  restoreFocus?: boolean;
}

const useModalA11y = <T extends HTMLElement>({
  isOpen,
  containerRef,
  initialFocusRef,
  onClose,
  lockBodyScroll = true,
  restoreFocus = true,
}: UseModalA11yOptions<T>) => {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const restorePreviousFocus = () => {
    window.setTimeout(() => {
      focusElement(previousActiveElementRef.current);
    }, 0);
  };

  useFocusTrap(containerRef, {
    enabled: isOpen,
    initialFocus: initialFocusRef,
    restoreFocus: false,
  });

  useLayoutEffect(() => {
    if (!isOpen) {
      if (restoreFocus && previousActiveElementRef.current) {
        restorePreviousFocus();
      }
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    if (lockBodyScroll) {
      document.body.style.overflow = 'hidden';
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }
      if (restoreFocus && previousActiveElementRef.current) {
        restorePreviousFocus();
      }
    };
  }, [isOpen, lockBodyScroll, onClose, restoreFocus]);
};

export default useModalA11y;
