import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listArms,
  listAssumptions,
  listContacts,
  listEntryLogs,
  listEvents,
  listMetrics,
  listProjects,
  listResults,
  listScenarios,
  listSites,
  listTemplates,
  listTrials,
  subscribeStore,
  syncTrouble,
  waitingToSync,
} from "../services/store";

// React Query owns server/store state (CLAUDE.md). The store notifies on
// writes; this hook invalidates so every page stays current.
export function useStoreInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeStore(() => {
        void queryClient.invalidateQueries();
      }),
    [queryClient],
  );
}

export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: listProjects });
export const useTrials = () => useQuery({ queryKey: ["trials"], queryFn: listTrials });
export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: listSites });
export const useArms = () => useQuery({ queryKey: ["arms"], queryFn: listArms });
export const useContacts = () => useQuery({ queryKey: ["contacts"], queryFn: listContacts });
export const useTemplates = () =>
  useQuery({ queryKey: ["templates"], queryFn: listTemplates });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: listEvents });
export const useMetrics = () => useQuery({ queryKey: ["metrics"], queryFn: listMetrics });
export const useEntryLogs = () =>
  useQuery({ queryKey: ["entryLogs"], queryFn: listEntryLogs });
export const useAssumptions = () =>
  useQuery({ queryKey: ["assumptions"], queryFn: listAssumptions });
export const useScenarios = () =>
  useQuery({ queryKey: ["scenarios"], queryFn: listScenarios });
export const useResults = () => useQuery({ queryKey: ["results"], queryFn: listResults });
export const useSyncTrouble = () =>
  useQuery({ queryKey: ["syncTrouble"], queryFn: syncTrouble });
export const useWaitingToSync = () =>
  useQuery({ queryKey: ["waitingToSync"], queryFn: waitingToSync });
