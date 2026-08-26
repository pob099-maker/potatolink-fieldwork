// The points in a crop's life that observations get hung off.
//
// Trial protocols are almost never written in dates. They say "at tuber
// initiation", "two weeks after emergence", "at desiccation" — because that is
// when the thing being measured is actually happening. A protocol written in
// dates would be wrong the first time a season ran late.
//
// So a stage is the anchor, and the day count is only an estimate of when the
// anchor will arrive. The estimate is there to make a calendar possible at
// all; it is expected to be wrong, and confirming the real date is a
// first-class action rather than an edit. See services/timing.ts.

/** One anchor point, with a rough idea of when it turns up. */
export interface GrowthStage {
  id: string;
  label: string;
  /**
   * Typical window in days after planting.
   *
   * Broad figures for a southern-Australian main crop, and they are a starting
   * point rather than a claim: variety, region, planting date and season move
   * every one of them, sometimes by a fortnight. They exist so a brand-new
   * trial can produce a calendar before anybody has watched the crop, and they
   * are superseded the moment a real stage date is confirmed.
   */
  dapFrom: number;
  dapTo: number;
}

/**
 * The default list, for potatoes.
 *
 * Named as a default rather than baked into components on purpose — the
 * platform is meant to carry VRI, haulm destruction, mechanisation and
 * irrigation work too, and a trial that wants different anchors sets its own
 * day counts against whichever of these come closest. Nothing in the timing
 * logic requires this particular list; it only requires that a stage has an
 * id and a window.
 */
export const DEFAULT_STAGES: GrowthStage[] = [
  { id: "emergence", label: "Emergence", dapFrom: 20, dapTo: 30 },
  { id: "tuberInitiation", label: "Tuber initiation", dapFrom: 35, dapTo: 45 },
  { id: "canopyClosure", label: "Canopy closure", dapFrom: 45, dapTo: 60 },
  { id: "bulking", label: "Tuber bulking", dapFrom: 60, dapTo: 90 },
  { id: "senescence", label: "Senescence", dapFrom: 90, dapTo: 110 },
  { id: "desiccation", label: "Desiccation / haulm destruction", dapFrom: 110, dapTo: 125 },
  { id: "harvest", label: "Harvest", dapFrom: 120, dapTo: 150 },
];

export function findStage(stages: GrowthStage[], id: string | null): GrowthStage | null {
  if (!id) return null;
  return stages.find((stage) => stage.id === id) ?? null;
}

/** The stage's own name, or the id itself if the list has moved on under it. */
export function stageLabel(stages: GrowthStage[], id: string | null): string {
  if (!id) return "";
  return findStage(stages, id)?.label ?? id;
}
