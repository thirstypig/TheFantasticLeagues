// Bill a period that was closed with "bill later". Shows the same dry-run fee
// preview as close step 4, then one confirm sheet, then a single real
// reconcile — which also writes the audit row that ends the deferral.
import React, { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Glass } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { ApiError } from "../../../api/base";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, PRIMARY, Skeleton, useLoad } from "../components/cardParts";
import { FeePreviewRows, dollars, feeHeadline, money, useFeePreview } from "../components/feePreview";
import { billIlFees, getLeaguePeriods, getUnbilledPeriods } from "../api";

function BillPreview({ leagueId, periodId, name, base }: { leagueId: number; periodId: number; name: string; base: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fees = useFeePreview(leagueId, periodId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  // Synchronous guard: state updates can lag a fast double-tap.
  const inFlight = useRef(false);

  if (fees.state === "loading") return <Glass padded={false}><Skeleton /></Glass>;
  if (fees.state === "error") {
    return <Glass padded={false}><CardError>Couldn’t load the IL fee preview. Reload to try again.</CardError></Glass>;
  }
  const total = fees.data.total;

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setCoolingDown(false);
    try {
      await billIlFees(leagueId, periodId);
      toast(`${name} billed`, "success");
      navigate(base);
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setSheetOpen(false);
      if (err instanceof ApiError && err.status === 429) setCoolingDown(true);
      else toast(err instanceof Error && err.message ? err.message : "Couldn’t bill IL fees.", "error");
    }
  }

  return (
    <>
      <Glass padded={false}>
        <FeePreviewRows preview={fees.data} headline={feeHeadline(total, "This would bill")} />
      </Glass>
      {coolingDown && <CardError>Billing is cooling down — try again in a minute.</CardError>}
      <button type="button" style={PRIMARY} onClick={() => setSheetOpen(true)} disabled={busy}>
        {total > 0 ? `Bill ${money(total)}` : "Bill IL fees"}
      </button>
      <ConfirmSheet
        open={sheetOpen}
        title={`Bill IL fees for ${name}?`}
        body={
          total > 0
            ? `${money(total)} in IL fees are billed. You can't undo this.`
            : total === 0
              ? "There are no IL fees to bill; this clears the reminder. You can't undo this."
              : `A ${dollars(total)} IL fee credit is applied. You can't undo this.`
        }
        confirmLabel="Bill IL fees"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setSheetOpen(false)}
      />
    </>
  );
}

export default function BillPeriodPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const base = `/commissioner/${leagueId}`;

  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const unbilled = useLoad(() => getUnbilledPeriods(leagueId), [leagueId]);
  const name =
    (periods.state === "ready" ? periods.data.find((p) => p.id === periodId)?.name : undefined) ?? `period ${periodId}`;

  let content: React.ReactNode;
  if (unbilled.state === "loading") {
    content = <Glass padded={false}><Skeleton /></Glass>;
  } else if (unbilled.state === "error") {
    content = <Glass padded={false}><CardError>Couldn’t check whether this period still needs billing.</CardError></Glass>;
  } else if (!unbilled.data.some((u) => u.periodId === periodId)) {
    content = (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Already billed</p>
        <Link to={base} style={LINK}>Back to Commissioner</Link>
      </Glass>
    );
  } else {
    content = <BillPreview leagueId={leagueId} periodId={periodId} name={name} base={base} />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        <Link to={base} style={LINK}>‹ Commissioner</Link>
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Bill IL fees · {name}</h1>
      </header>
      {content}
    </div>
  );
}
