"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AssistantPageContext } from "@/lib/ai/assistant-context";

interface AssistantController {
  attachedContext: AssistantPageContext | null;
  currentPageContext: AssistantPageContext | null;
  isOpen: boolean;
  attachCurrentPage: () => void;
  closeAssistant: () => void;
  detachContext: () => void;
  openAssistant: () => void;
  setCurrentPageContext: (context: AssistantPageContext | null) => void;
}

const AssistantContext = createContext<AssistantController | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPageContext, setCurrentPageContext] =
    useState<AssistantPageContext | null>(null);
  const [attachedContext, setAttachedContext] =
    useState<AssistantPageContext | null>(null);

  const openAssistant = useCallback(() => {
    setAttachedContext((context) => context ?? currentPageContext);
    setIsOpen(true);
  }, [currentPageContext]);

  const value = useMemo<AssistantController>(
    () => ({
      attachedContext,
      currentPageContext,
      isOpen,
      attachCurrentPage: () => setAttachedContext(currentPageContext),
      closeAssistant: () => setIsOpen(false),
      detachContext: () => setAttachedContext(null),
      openAssistant,
      setCurrentPageContext,
    }),
    [attachedContext, currentPageContext, isOpen, openAssistant],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function AssistantPageContext({
  context,
}: {
  context: AssistantPageContext;
}) {
  const { setCurrentPageContext } = useAssistant();

  useEffect(() => {
    setCurrentPageContext(context);
    return () => setCurrentPageContext(null);
  }, [context, setCurrentPageContext]);

  return null;
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider");
  }
  return context;
}
