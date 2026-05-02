import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { FieldDefinition } from "../types";
import { FieldType } from "../types";
import { Modal } from "../components/Modal";
import { useWalletContext } from "../connection/WalletContext";

interface FormState {
  poolName: string;
  criteriaMetadataCID: string;
  submissionStart: string;
  submissionEnd: string;
  reviewDuration: string;
  signers: string[];
  usdtTokenAddress: string;
  initialDeposit: string;
}

const EMPTY_FORM: FormState = {
  poolName: "",
  criteriaMetadataCID: "",
  submissionStart: "",
  submissionEnd: "",
  reviewDuration: "7",
  signers: ["", "", ""],
  usdtTokenAddress: "",
  initialDeposit: "",
};

type FormErrors = Partial<Record<keyof FormState | "fields", string>>;

const CREATE_POOL_PHOTO =
  "https://images.unsplash.com/photo-1741699428220-65f37f3fbbcb?auto=format&fit=crop&w=1000&q=80";

export function CreatePoolPage() {
  const { wallet } = useWalletContext();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fields, setFields] = useState<FieldDefinition[]>([
    { fieldType: FieldType.TEXT, label: "", required: true },
  ]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [successModal, setSuccess] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function setSigner(i: number, val: string) {
    const next = [...form.signers];
    next[i] = val;
    setForm((f) => ({ ...f, signers: next }));
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.poolName.trim()) e.poolName = "Required.";
    if (!form.criteriaMetadataCID.trim()) e.criteriaMetadataCID = "Required.";
    if (!form.submissionStart) e.submissionStart = "Required.";
    if (!form.submissionEnd) e.submissionEnd = "Required.";
    if (form.submissionStart && form.submissionEnd) {
      const s = new Date(form.submissionStart).getTime() / 1000;
      const e2 = new Date(form.submissionEnd).getTime() / 1000;
      if (s <= Date.now() / 1000) e.submissionStart = "Must be in the future.";
      if (e2 <= s + 86400)
        e.submissionEnd = "Must be at least 1 day after start.";
    }
    if (Number(form.reviewDuration) < 1) e.reviewDuration = "Minimum 1 day.";
    const valid = form.signers.filter((s) =>
      /^0x[0-9a-fA-F]{40}$/.test(s.trim()),
    );
    if (valid.length < 3) e.signers = "Need at least 3 valid 0x addresses.";
    if (!form.usdtTokenAddress.trim()) e.usdtTokenAddress = "Required.";
    if (fields.some((f) => !f.label.trim()))
      e.fields = "All field labels are required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1400));
    setSubmitting(false);
    setSuccess(true);
  }

  if (!wallet.isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-5xl mb-4">🔒</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Wallet not connected
        </h2>
        <p className="text-slate-500 text-sm">
          Connect your wallet to create a grant pool.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="scholar-card-strong rounded-3xl overflow-hidden mb-8">
        <div className="grid md:grid-cols-[1fr_320px]">
          <div className="p-7 sm:p-8">
            <p className="text-xs font-extrabold text-teal-700 uppercase tracking-[0.22em] mb-3">
              Launch funding
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#07182b] mb-2">
              Create a Grant Pool
            </h1>
            <p className="text-sm text-slate-500 max-w-xl">
              All parameters are set at deploy time and stored immutably
              on-chain.
            </p>
          </div>
          <img
            src={CREATE_POOL_PHOTO}
            alt="Student working from a university library"
            className="hidden md:block h-full min-h-[190px] w-full object-cover"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* ── Pool Identity ── */}
        <Fieldset title="Pool Identity">
          <Field label="Pool Name" error={errors.poolName} required>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. Web3 Developer Scholarship 2025"
              value={form.poolName}
              onChange={(e) => setField("poolName", e.target.value)}
              className={input(errors.poolName)}
            />
          </Field>
          <Field
            label="Criteria Metadata CID"
            error={errors.criteriaMetadataCID}
            hint="Upload your criteria PDF to IPFS and paste the CID."
            required
          >
            <input
              type="text"
              placeholder="QmXyZ…"
              value={form.criteriaMetadataCID}
              onChange={(e) => setField("criteriaMetadataCID", e.target.value)}
              className={input(errors.criteriaMetadataCID)}
            />
          </Field>
        </Fieldset>

        {/* ── Timing ── */}
        <Fieldset title="Timing">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Submission Opens"
              error={errors.submissionStart}
              required
            >
              <input
                type="datetime-local"
                value={form.submissionStart}
                onChange={(e) => setField("submissionStart", e.target.value)}
                className={input(errors.submissionStart)}
              />
            </Field>
            <Field
              label="Submission Closes"
              error={errors.submissionEnd}
              required
            >
              <input
                type="datetime-local"
                value={form.submissionEnd}
                onChange={(e) => setField("submissionEnd", e.target.value)}
                className={input(errors.submissionEnd)}
              />
            </Field>
          </div>
          <Field
            label="Review Duration (days)"
            error={errors.reviewDuration}
            hint="Minimum 1 day. How long reviewers have after submissions close."
            required
          >
            <input
              type="number"
              min={1}
              max={90}
              value={form.reviewDuration}
              onChange={(e) => setField("reviewDuration", e.target.value)}
              className={`${input(errors.reviewDuration)} max-w-[120px]`}
            />
          </Field>
        </Fieldset>

        {/* ── Review panel ── */}
        <Fieldset
          title="Review Panel"
          desc="At least 3 Ethereum addresses. Approval requires 70% quorum. List locks when submissions open."
        >
          {errors.signers && (
            <p className="text-xs text-red-600 mb-2">{errors.signers}</p>
          )}
          <div className="space-y-2">
            {form.signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <input
                  type="text"
                  placeholder="0x…"
                  value={s}
                  onChange={(e) => setSigner(i, e.target.value)}
                  className="scholar-input flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
                />
                {form.signers.length > 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        signers: f.signers.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {form.signers.length < 20 && (
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, signers: [...f.signers, ""] }))
              }
              className="mt-2 text-sm text-teal-700 hover:underline cursor-pointer"
            >
              + Add Reviewer
            </button>
          )}
        </Fieldset>

        {/* ── Funding ── */}
        <Fieldset title="Funding">
          <Field
            label="USDT Token Address"
            error={errors.usdtTokenAddress}
            hint="The ERC-20 USDT contract on the target network."
            required
          >
            <input
              type="text"
              placeholder="0x…"
              value={form.usdtTokenAddress}
              onChange={(e) => setField("usdtTokenAddress", e.target.value)}
              className={`${input(errors.usdtTokenAddress)} font-mono`}
            />
          </Field>
          <Field
            label="Initial Deposit (USDT)"
            hint="Optional. A 10% protocol fee applies at distribution."
          >
            <input
              type="number"
              min={0}
              placeholder="0"
              value={form.initialDeposit}
              onChange={(e) => setField("initialDeposit", e.target.value)}
              className={`${input()} max-w-[160px]`}
            />
          </Field>
        </Fieldset>

        {/* ── Application form schema ── */}
        <Fieldset
          title="Application Form Schema"
          desc="Fields applicants must fill in. Stored on-chain. Max 10 fields."
        >
          {errors.fields && (
            <p className="text-xs text-red-600 mb-2">{errors.fields}</p>
          )}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <select
                  value={f.fieldType}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((x, idx) =>
                        idx === i
                          ? { ...x, fieldType: e.target.value as FieldType }
                          : x,
                      ),
                    )
                  }
                  className="scholar-input text-xs rounded-lg border px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value={FieldType.TEXT}>Text</option>
                  <option value={FieldType.URL}>URL</option>
                  <option value={FieldType.DOCUMENT}>Document</option>
                </select>
                <input
                  type="text"
                  placeholder="Field label, e.g. Project Description"
                  value={f.label}
                  onChange={(e) =>
                    setFields((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  className="scholar-input flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent min-w-0"
                />
                <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setFields((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, required: e.target.checked } : x,
                        ),
                      )
                    }
                    className="rounded"
                  />
                  Required
                </label>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setFields((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {fields.length < 10 && (
            <button
              type="button"
              onClick={() =>
                setFields((prev) => [
                  ...prev,
                  { fieldType: FieldType.TEXT, label: "", required: true },
                ])
              }
              className="mt-2 text-sm text-teal-700 hover:underline cursor-pointer"
            >
              + Add Field
            </button>
          )}
        </Fieldset>

        {/* Fee notice */}
        <div className="flex gap-3 p-4 rounded-xl bg-teal-50 border border-teal-200">
          <span className="text-lg shrink-0">ℹ️</span>
          <div className="text-sm text-teal-900">
            <p className="font-semibold">Protocol fee: 10%</p>
            <p className="text-teal-700 mt-0.5">
              10% of total deposits go to the ScholarChain treasury at
              distribution. The remaining 90% goes to winners, or is refunded
              proportionally if there are none.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isSubmitting ? "Deploying…" : "Deploy Pool"}
          </button>
        </div>
      </form>

      <Modal
        open={successModal}
        onClose={() => {
          setSuccess(false);
          navigate("/dashbar/explore");
        }}
        title="Pool Deployed!"
      >
        <div className="text-center py-4">
          <p className="text-5xl mb-4">🎉</p>
          <p className="text-slate-700 mb-1">
            Your pool <strong>{form.poolName}</strong> has been deployed.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Transaction submitted. It will appear in Explorer once confirmed.
          </p>
          <button
            onClick={() => {
              setSuccess(false);
              navigate("/dashbar/explore");
            }}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer"
          >
            View in Explorer
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Small helpers ── */
function Fieldset({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="scholar-card rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-1">
        {title}
      </h2>
      {desc && <p className="text-xs text-slate-500 mb-4">{desc}</p>}
      <div className="space-y-4 mt-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function input(error?: string) {
  return `scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
    error
      ? "border-red-400 focus:ring-red-400"
      : "border-slate-300 focus:ring-teal-500"
  }`;
}
