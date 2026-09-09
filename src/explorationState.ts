import { getWorkspaceAssetIdentity, WorkspaceAsset } from "./workspaceAsset";

export interface ExplorationState {
  query: string;
  selectedIdentity?: string;
  scrollY: number;
}

export interface ReconciledExplorationState extends ExplorationState {
  selectionStatus: "none" | "available" | "missing";
}

export function createExplorationState(): ExplorationState {
  return {
    query: "",
    scrollY: 0,
  };
}

export function reconcileExplorationState(
  state: ExplorationState,
  assets: readonly WorkspaceAsset[],
): ReconciledExplorationState {
  const scrollY = Number.isFinite(state.scrollY) && state.scrollY > 0 ? state.scrollY : 0;

  if (!state.selectedIdentity) {
    return {
      query: state.query,
      scrollY,
      selectionStatus: "none",
    };
  }

  const selectionStatus = assets.some(
    (asset) => getWorkspaceAssetIdentity(asset) === state.selectedIdentity,
  )
    ? "available"
    : "missing";

  return {
    query: state.query,
    selectedIdentity: state.selectedIdentity,
    scrollY,
    selectionStatus,
  };
}
