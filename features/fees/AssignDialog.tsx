"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Field,
  FormDialog,
  Input,
  money,
  Picker,
} from "@/components/campus/ui";
import { useState, useRef } from "react";
import { toast } from "sonner";
export function AssignDialog({
  open,
  onClose,
  studentId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
}) {
  const { request, query, refresh, can } = useApp(),
    [structureId, setStructure] = useState(""),
    [discount, setDiscount] = useState("0"),
    [scholarship, setScholarship] = useState("0"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const list = useResource<Row>(
    open ? "structures?" + query({ size: "100" }) : null,
  );
  const structures: Row[] = list.data?.rows || [];
  const close = () => {
    setStructure("");
    setError("");
    onClose();
  };
  return (
    <FormDialog
      open={open}
      onClose={close}
      title="Assign fees & generate invoice"
      description="An invoice, installment schedule and permanent ledger entries are created together."
      busy={busy}
      submitDisabled={busy || !structures.length}
      submitLabel="Assign & generate invoice"
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current) return;
        if (!structureId) {
          setError("Select a fee structure before assigning fees.");
          return;
        }
        inFlight.current = true;
        setError("");
        setBusy(true);
        try {
          await request("invoices", {
            method: "POST",
            body: { studentId, structureId, discount, scholarship, reason },
          });
          toast.success("Fee structure assigned. Invoice generated.");
          refresh();
          close();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <Field
        label="Fee structure"
        required
        error={error || list.error || undefined}
      >
        <Picker
          value={structureId}
          onChange={(v) => {
            setStructure(v);
            setError("");
          }}
          options={[
            { value: "", label: "Select a fee structure" },
            ...structures.map((r) => ({
              value: r.id,
              label: r.name + " · " + money(r.total_paise),
            })),
          ]}
        />
      </Field>
      {can("fees.manage") && (
        <div className="form-grid">
          <Field label="Discount (₹)">
            <Input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Scholarship (₹)">
            <Input
              value={scholarship}
              onChange={(e) => setScholarship(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Approval reason" className="span-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required when applying a concession"
            />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}
