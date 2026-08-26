// Reading a factorial three ways.
//
// The combination means say what each exact mix did. The main effects say what
// each factor did on its own. The interaction says whether that second answer
// is even meaningful — because if nitrogen pays under full irrigation and does
// nothing under deficit, there is no single "effect of nitrogen" to quote, and
// a report that quotes one is wrong in a way the numbers will not reveal.
//
// That is the whole reason for crossing factors rather than testing them
// separately, so the interaction is not buried at the bottom as a curiosity.
//
// Descriptive throughout. No F ratio, no p value. An interaction that looks
// real here is a reason to run the analysis properly, not a result.

import { useMemo } from "react";
import { Card, CardTitle, Section } from "./ui";
import {
  combinationMeans,
  designBalance,
  interaction,
  mainEffect,
} from "../services/factorialAnalysis";
import { buildCombinations } from "../services/factorial";
import type { Factor, FactorLevel, MeasurementEvent, Metric, PracticeArm, Trial } from "../types";

const n2 = (value: number | null) => (value === null ? "—" : value.toFixed(2));

export function FactorialResults({
  trial,
  factors,
  levels,
  arms,
  events,
  metrics,
  responseLabel,
  responseUnit,
}: {
  trial: Trial;
  factors: Factor[];
  levels: FactorLevel[];
  arms: PracticeArm[];
  events: MeasurementEvent[];
  metrics: Metric[];
  responseLabel: string;
  responseUnit: string;
}) {
  const combinations = useMemo(() => buildCombinations(factors, levels), [factors, levels]);

  // combinationId -> the arm carrying it. Arms hold their factor levels, so
  // this is a lookup rather than a stored join.
  const armByCombination = useMemo(() => {
    const index = new Map<string, string>();
    for (const combination of combinations) {
      const arm = arms.find(
        (candidate) =>
          JSON.stringify(candidate.factorLevels ?? {}) === JSON.stringify(combination.members),
      );
      if (arm) index.set(combination.combinationId, arm.armId);
    }
    return index;
  }, [combinations, arms]);

  const stats = useMemo(
    () =>
      combinationMeans({
        combinations,
        armByCombination,
        events,
        metrics,
        response: trial.responseMetric,
      }),
    [combinations, armByCombination, events, metrics, trial.responseMetric],
  );

  const balance = designBalance(stats);
  const unit = responseUnit ? ` (${responseUnit})` : "";

  if (combinations.length === 0) return null;

  return (
    <>
      <Section
        title="Each treatment combination"
        description={`Mean ${responseLabel.toLowerCase()} for every exact mix.`}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="report-table tabular w-full text-sm">
              <thead>
                <tr>
                  <th scope="col">Combination</th>
                  <th scope="col" className="num">n</th>
                  <th scope="col" className="num">Mean{unit}</th>
                  <th scope="col" className="num">± SE</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={stat.combinationId}>
                    <td>{stat.label}</td>
                    <td className="num">{stat.n}</td>
                    <td className="num">{n2(stat.mean)}</td>
                    <td className="num">{n2(stat.se)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!balance.balanced ? (
            <p className="mt-3 rounded-lg bg-sunk p-3 text-sm text-ink-soft">
              The design is not balanced — combinations hold between {balance.minN} and{" "}
              {balance.maxN} plots
              {balance.empty > 0
                ? `, and ${balance.empty} ${balance.empty === 1 ? "has" : "have"} nothing recorded`
                : ""}
              . The main effects below average the combination means rather than every plot,
              so a combination that lost a plot still counts once — which is what “averaged
              across the other factors” is supposed to mean.
            </p>
          ) : null}
        </Card>
      </Section>

      <Section
        title="What each factor did"
        description="Its effect, averaged across the levels of the others."
      >
        {factors.map((factor) => {
          const effect = mainEffect(factor, levels, combinations, stats);
          return (
            <Card key={factor.factorId}>
              <CardTitle>{factor.name}</CardTitle>
              <div className="mt-2 overflow-x-auto">
                <table className="report-table tabular w-full text-sm">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col" className="num">Combinations</th>
                      <th scope="col" className="num">Plots</th>
                      <th scope="col" className="num">Mean{unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effect.levels.map((level) => (
                      <tr key={level.levelId}>
                        <td>{level.label}</td>
                        <td className="num">{level.combinations}</td>
                        <td className="num">{level.plots}</td>
                        <td className="num">{n2(level.mean)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {effect.range !== null ? (
                <p className="mt-2 text-sm text-ink-soft">
                  Spread across levels: {effect.range.toFixed(2)}
                  {responseUnit ? ` ${responseUnit}` : ""}.
                </p>
              ) : null}
            </Card>
          );
        })}
      </Section>

      {factors.length > 1 ? (
        <Section
          title="Whether the factors depend on each other"
          description="If one factor's effect changes with another, neither can be read on its own."
        >
          {factors.slice(0, -1).flatMap((rowFactor, index) =>
            factors.slice(index + 1).map((columnFactor) => {
              const grid = interaction(rowFactor, columnFactor, levels, combinations, stats);
              return (
                <Card key={`${rowFactor.factorId}-${columnFactor.factorId}`}>
                  <CardTitle>
                    {rowFactor.name} × {columnFactor.name}
                  </CardTitle>
                  <div className="mt-2 overflow-x-auto">
                    <table className="report-table tabular w-full text-sm">
                      <thead>
                        <tr>
                          <th scope="col">
                            {rowFactor.name} ╲ {columnFactor.name}
                          </th>
                          {grid.columnLevels.map((column) => (
                            <th key={column.levelId} scope="col" className="num">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grid.rowLevels.map((row) => (
                          <tr key={row.levelId}>
                            <th scope="row" className="font-normal">
                              {row.label}
                            </th>
                            {grid.columnLevels.map((column) => {
                              const cell = grid.cells.find(
                                (entry) =>
                                  entry.rowLevelId === row.levelId &&
                                  entry.columnLevelId === column.levelId,
                              );
                              return (
                                <td key={column.levelId} className="num">
                                  {n2(cell?.mean ?? null)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {grid.note ? <p className="mt-2 text-sm text-ink-soft">{grid.note}</p> : null}
                </Card>
              );
            }),
          )}
        </Section>
      ) : null}

      <p className="text-sm text-ink-faint">
        These are descriptive figures. Nothing here is a significance test, and an
        interaction that looks real is a reason to analyse the exported data properly
        rather than a result in itself.
      </p>
    </>
  );
}
