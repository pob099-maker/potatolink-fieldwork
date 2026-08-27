import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listArms,
  listContacts,
  listTrialMembers,
  listEntryLogs,
  listEvents,
  listMetrics,
  listProjects,
  listResults,
  listWeather,
  listSoilSamples,
  listSoilResults,
  listLibrary,
  listFactors,
  listFactorLevels,
  listSites,
  listTemplates,
  listTrials,
  subscribeStore,
  deviceRole,
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
export const useTrialMembers = () =>
  useQuery({ queryKey: ["trialMembers"], queryFn: listTrialMembers });
export const useTemplates = () =>
  useQuery({ queryKey: ["templates"], queryFn: listTemplates });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: listEvents });
export const useMetrics = () => useQuery({ queryKey: ["metrics"], queryFn: listMetrics });
export const useEntryLogs = () =>
  useQuery({ queryKey: ["entryLogs"], queryFn: listEntryLogs });
export const useResults = () => useQuery({ queryKey: ["results"], queryFn: listResults });
export const useWeather = () => useQuery({ queryKey: ["weather"], queryFn: listWeather });
export const useSoilSamples = () =>
  useQuery({ queryKey: ["soilSamples"], queryFn: listSoilSamples });
export const useSoilResults = () =>
  useQuery({ queryKey: ["soilResults"], queryFn: listSoilResults });
export const useLibrary = () => useQuery({ queryKey: ["library"], queryFn: listLibrary });
export const useFactors = () => useQuery({ queryKey: ["factors"], queryFn: listFactors });
export const useFactorLevels = () =>
  useQuery({ queryKey: ["factorLevels"], queryFn: listFactorLevels });
export const useSyncTrouble = () =>
  useQuery({ queryKey: ["syncTrouble"], queryFn: syncTrouble });
export const useWaitingToSync = () =>
  useQuery({ queryKey: ["waitingToSync"], queryFn: waitingToSync });
export const useDeviceRole = () =>
  useQuery({ queryKey: ["deviceRole"], queryFn: deviceRole });
