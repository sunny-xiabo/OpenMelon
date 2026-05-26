import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '../../../components/ConfirmDialog';

const UIContext = createContext();

export const useUIContext = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within a UIProvider');
  return ctx;
};

export const UIProvider = ({ children }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });

  const requestConfirm = useCallback((message) => new Promise((resolve) => {
    setConfirmDialog({
      open: true,
      message,
      onConfirm: () => { setConfirmDialog({ open: false, message: '', onConfirm: null }); resolve(true); },
      onCancel: () => { setConfirmDialog({ open: false, message: '', onConfirm: null }); resolve(false); },
    });
  }), []);

  const value = useMemo(() => ({
    activeStep, setActiveStep,
    loading, setLoading,
    loadingMessage, setLoadingMessage,
    requestConfirm,
  }), [activeStep, loading, loadingMessage, requestConfirm]);

  return (
    <UIContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={confirmDialog.open}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={confirmDialog.onCancel}
        danger
      />
    </UIContext.Provider>
  );
};
