import {
  SeasonTable,
  PeriodMeta,
  TeamSeasonRow,
} from "../../../components/StatsTables";
import PageHeader from "../../../components/ui/PageHeader";

// 2025 OGBA meeting periods pulled from the Excel workbook
const PERIODS_2025: PeriodMeta[] = [
  { periodId: "P1", label: "April 20", meetingDate: "2025-04-20" },
  { periodId: "P2", label: "May 18", meetingDate: "2025-05-18" },
  { periodId: "P3", label: "June 08", meetingDate: "2025-06-08" },
  { periodId: "P4", label: "July 6", meetingDate: "2025-07-06" },
  { periodId: "P5", label: "Aug 03", meetingDate: "2025-08-03" },
  { periodId: "P6", label: "Aug 31", meetingDate: "2025-08-31" },
];

// 2025 season standings per meeting date (cumulative points),
// exactly as recorded in the Excel "2025 Standings" blocks.
// Numbers here ALREADY include ties and .5 scores.
const SEASON_ROWS_2025: TeamSeasonRow[] = [
  {
    teamId: "DodgerDawgs",
    teamName: "Dodger Dawgs",
    periodPoints: {
      P1: 54.0,
      P2: 118.0,
      P3: 186.0,
      P4: 252.0,
      P5: 304.0,
      P6: 354.5,
    },
    seasonTotalPoints: 399.0,
  },
  {
    teamId: "DemolitionLumberCo",
    teamName: "Demolition Lumber Co.",
    periodPoints: {
      P1: 65.0,
      P2: 111.0,
      P3: 149.0,
      P4: 206.5,
      P5: 246.5,
      P6: 288.0,
    },
    seasonTotalPoints: 332.5,
  },
  {
    teamId: "TheShow",
    teamName: "The Show",
    periodPoints: {
      P1: 42.0,
      P2: 88.0,
      P3: 136.5,
      P4: 161.5,
      P5: 212.5,
      P6: 268.0,
    },
    seasonTotalPoints: 323.0,
  },
  {
    teamId: "LosDoyers",
    teamName: "Los Doyers",
    periodPoints: {
      P1: 32.5,
      P2: 89.0,
      P3: 133.0,
      P4: 180.5,
      P5: 218.0,
      P6: 272.0,
    },
    seasonTotalPoints: 320.0,
  },
  {
    teamId: "SkunkDogs",
    teamName: "Skunk Dogs",
    periodPoints: {
      P1: 32.0,
      P2: 72.0,
      P3: 114.5,
      P4: 167.0,
      P5: 217.0,
      P6: 269.0,
    },
    seasonTotalPoints: 317.0,
  },
  {
    teamId: "RGingSluggers",
    teamName: "RGing Sluggers",
    periodPoints: {
      P1: 46.0,
      P2: 91.5,
      P3: 133.0,
      P4: 171.0,
      P5: 234.5,
      // P6 is missing in the August 31 sheet, so we treat it as null.
      // UI will show 0.0 for that slot, but final total is still correct.
      P6: null as unknown as number,
    },
    seasonTotalPoints: 311.5,
  },
  {
    teamId: "DiamondKings",
    teamName: "Diamond Kings",
    periodPoints: {
      P1: 34.5,
      P2: 72.0,
      P3: 102.0,
      P4: 141.5,
      P5: 179.5,
      P6: 218.0,
    },
    seasonTotalPoints: 261.0,
  },
  {
    teamId: "DevilDawgs",
    teamName: "Devil Dawgs",
    periodPoints: {
      P1: 54.0,
      P2: 78.5,
      P3: 126.0,
      P4: 160.0,
      P5: 188.0,
      P6: 217.0,
    },
    seasonTotalPoints: 256.0,
  },
];

const SeasonStandings = () => {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="mb-10">
        <PageHeader 
          title="Historical Season Standings" 
          subtitle="Cumulative roto points for the 2025 season."
        />
      </div>

      <div className="lg-card p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--lg-text-heading)] uppercase">2025 OGBA Matrix</h2>
          <p className="text-sm text-[var(--lg-text-secondary)] mt-2 opacity-60 leading-relaxed">
            Cumulative roto points by meeting date. Values already include ties
            and half-points exactly as scored in the 2025 sheet.
          </p>
        </div>

        <SeasonTable periods={PERIODS_2025} rows={SEASON_ROWS_2025} />
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-30">
          2025 Season Stats
        </p>
      </div>
    </div>
  );
};

export default SeasonStandings;
