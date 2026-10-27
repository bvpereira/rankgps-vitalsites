"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "rankgps.serper-key";

export function useApiKey() {
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  // Read browser-only storage after hydration; server HTML must always have an empty key.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setApiKey(saved);
        setRemember(true);
      }
    } catch {
      setStorageError(
        "O armazenamento do navegador está indisponível. Você pode usar a chave nesta página.",
      );
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function persist(value: string, shouldRemember: boolean) {
    try {
      if (shouldRemember && value.trim())
        localStorage.setItem(STORAGE_KEY, value.trim());
      else localStorage.removeItem(STORAGE_KEY);
      setStorageError("");
    } catch {
      setStorageError(
        "Não foi possível atualizar a chave salva. Confira as permissões de armazenamento do navegador; uma cópia anterior pode permanecer salva.",
      );
    }
  }

  function updateKey(value: string) {
    setApiKey(value);
    persist(value, remember);
  }

  function updateRemember(value: boolean) {
    setRemember(value);
    persist(apiKey, value);
  }

  function clearKey() {
    setApiKey("");
    setRemember(false);
    persist("", false);
  }

  return {
    apiKey,
    remember,
    ready,
    storageError,
    updateKey,
    updateRemember,
    clearKey,
  };
}
