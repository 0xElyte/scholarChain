import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getAddress, isAddress } from "ethers";
import type { FieldDefinition } from "../types";
import { FieldType } from "../types";
import { Modal } from "../components/Modal";
import { useWalletContext } from "../connection/WalletContext";
import { useDeployPool } from "../hooks/write-hooks/useDeployPool";
import useDonatePool from "../hooks/write-hooks/useDonatePool";
import { uploadPdfToPinata } from "../utils/pinata";

interface FormState {
  poolName: string;
  criteriaFile: File | null;
  criteriaMetadataCID: string;
  submissionStart: string;
  submissionEnd: string;
  reviewDuration: string;
  initialDonation: string;
  signers: string[];
}

const DEFAULT_USDT_ADDRESS = (
  import.meta.env.VITE_MOCK_USDT_ADDRESS || ""
).trim();

const EMPTY_FORM: FormState = {
  poolName: "",
  criteriaFile: null,
  criteriaMetadataCID: "",
  submissionStart: "",
  submissionEnd: "",
  reviewDuration: "7",
  initialDonation: "",
  signers: ["", "", ""],
};

type FormErrors = Partial<
  Record<keyof FormState | "fields" | "usdtTokenAddress", string>
>;

const CREATE_POOL_PHOTO =
  "https://images.unsplash.com/photo-1741699428220-65f37f3fbbcb?auto=format&fit=crop&w=1000&q=80";

export function CreatePoolPage() {
  const { wallet } = useWalletContext();
  const navigate = useNavigate();
  const {
    deploy: deployPool,
    isLoading,
    error: deployError,
    createdPoolAddress,
  } = useDeployPool();
  const { donate, loading: donating } = useDonatePool();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fields, setFields] = useState<FieldDefinition[]>([
    { fieldType: FieldType.TEXT, label: "", required: true },
  ]);
  const [successModal, setSuccess] = useState(false);
  const [postDeployNotice, setPostDeployNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [criteriaUploadState, setCriteriaUploadState] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [criteriaUploadError, setCriteriaUploadError] = useState<string | null>(
    null,
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function setCriteriaFile(file: File | null) {
    setCriteriaUploadError(null);

    if (!file) {
      setForm((f) => ({
        ...f,
        criteriaFile: null,
        criteriaMetadataCID: "",
      }));
      setCriteriaUploadState("idle");
      return;
    }

    setField("criteriaFile", file);
    setCriteriaUploadState("uploading");

    try {
      const cid = await uploadPdfToPinata(
        file,
        `${form.poolName.trim() || "criteria"}-criteria.pdf`,
      );
      setForm((f) => ({
        ...f,
        criteriaFile: file,
        criteriaMetadataCID: cid,
      }));
      setCriteriaUploadState("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setCriteriaUploadState("error");
      setCriteriaUploadError(message);
      setForm((f) => ({
        ...f,
        criteriaFile: null,
        criteriaMetadataCID: "",
      }));
      setErrors((e) => ({ ...e, criteriaFile: message }));
    }
  }

  function setSigner(i: number, val: string) {
    const next = [...form.signers];
    next[i] = val;
    setForm((f) => ({ ...f, signers: next }));
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.poolName.trim()) e.poolName = "Required.";

    if (!form.criteriaFile) e.criteriaFile = "Upload a PDF criteria document.";
    else if (form.criteriaFile.type !== "application/pdf") {
      e.criteriaFile = "Criteria must be a PDF file.";
    } else if (!form.criteriaMetadataCID) {
      e.criteriaFile = "Wait for the PDF upload to finish before deploying.";
    }

    if (!form.submissionStart) e.submissionStart = "Required.";
    if (!form.submissionEnd) e.submissionEnd = "Required.";
    if (form.submissionStart && form.submissionEnd) {
      const start = new Date(form.submissionStart).getTime() / 1000;
      const end = new Date(form.submissionEnd).getTime() / 1000;
      if (start <= Date.now() / 1000)
        e.submissionStart = "Must be in the future.";
      if (end <= start + 86400)
        e.submissionEnd = "Must be at least 1 day after start.";
    }
    if (Number(form.reviewDuration) < 1) e.reviewDuration = "Minimum 1 day.";

    if (form.initialDonation.trim()) {
      const amount = Number(form.initialDonation);
      if (Number.isNaN(amount) || amount < 0) {
        e.initialDonation = "Enter a valid USDT amount.";
      }
    }

    const normalizedSigners: string[] = [];
    const seenSigners = new Set<string>();
    for (const signer of form.signers) {
      const trimmed = signer.trim();
      if (!trimmed) continue;
      if (!isAddress(trimmed)) {
        e.signers = "Need at least 3 unique valid 0x addresses.";
        break;
      }

      const checksum = getAddress(trimmed);
      const key = checksum.toLowerCase();
      if (seenSigners.has(key)) {
        e.signers = "Reviewer addresses must be unique.";
        break;
      }
      seenSigners.add(key);
      normalizedSigners.push(checksum);
    }
    if (!e.signers && normalizedSigners.length < 3) {
      e.signers = "Need at least 3 unique valid 0x addresses.";
    }

    if (!DEFAULT_USDT_ADDRESS) {
      e.usdtTokenAddress =
        "Mock USDT is not configured. Set VITE_MOCK_USDT_ADDRESS in frontend/.env.";
    } else if (!isAddress(DEFAULT_USDT_ADDRESS)) {
      e.usdtTokenAddress =
        "Configured VITE_MOCK_USDT_ADDRESS is not a valid address.";
    }

    if (fields.some((field) => !field.label.trim())) {
      e.fields = "All field labels are required.";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!validate()) return;

    try {
      setPostDeployNotice(null);

      const deployedPoolAddress = await deployPool({
        poolName: form.poolName,
        criteriaMetadataCID: form.criteriaMetadataCID,
        submissionStart: new Date(form.submissionStart),
        submissionEnd: new Date(form.submissionEnd),
        reviewDuration: Number(form.reviewDuration),
        signers: form.signers,
        usdtTokenAddress: DEFAULT_USDT_ADDRESS,
        fields,
      });

      const donationAmount = form.initialDonation.trim();
      if (donationAmount && Number(donationAmount) > 0) {
        try {
          await donate(
            deployedPoolAddress,
            donationAmount,
            DEFAULT_USDT_ADDRESS,
          );
          setPostDeployNotice(
            `Initial donation of ${donationAmount} USDT sent.`,
          );
        } catch (donationErr) {
          const donationMessage =
            donationErr instanceof Error
              ? donationErr.message
              : "Initial donation failed.";
          setPostDeployNotice(
            `Pool deployed, but the initial donation could not be sent: ${donationMessage}`,
          );
        }
      }

      setSuccess(true);
    } catch (err) {
      // Error is already handled by useDeployPool hook
      return;
    }
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
        {deployError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {deployError}
          </div>
        )}

        <Fieldset title="Pool Identity">
          <Field label="Pool Name" error={errors.poolName} required>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. Web3 Developer Grant 2025"
              value={form.poolName}
              onChange={(e) => setField("poolName", e.target.value)}
              className={input(errors.poolName)}
            />
          </Field>
          <Field
            label="Criteria PDF"
            error={errors.criteriaFile}
            hint="Upload the PDF that explains the grant criteria. It will be pinned to Pinata and stored on-chain as an IPFS reference."
            required
          >
            <div className="space-y-2">
              {!form.criteriaFile ? (
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setCriteriaFile(e.target.files?.[0] ?? null)}
                  className={input(errors.criteriaFile)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {criteriaUploadState === "uploading"
                      ? "🔄"
                      : criteriaUploadState === "done"
                        ? "✅"
                        : "📄"}
                  </span>
                  <span className="text-sm text-slate-700 font-mono break-all">
                    {form.criteriaFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCriteriaFile(null)}
                    className="ml-auto text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
              {criteriaUploadState === "uploading" && (
                <p className="text-xs text-slate-500">
                  Uploading PDF to IPFS...
                </p>
              )}
              {criteriaUploadState === "done" && form.criteriaMetadataCID && (
                <p className="text-xs text-emerald-600">
                  Uploaded and ready to deploy.
                </p>
              )}
              {criteriaUploadState === "error" && criteriaUploadError && (
                <p className="text-xs text-red-600">{criteriaUploadError}</p>
              )}
            </div>
          </Field>
          <Field
            label="Initial Donation (USDT)"
            error={errors.initialDonation}
            hint="Optional. If filled in, your wallet will approve and donate this amount to the pool immediately after deployment."
          >
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 100"
              value={form.initialDonation}
              onChange={(e) => setField("initialDonation", e.target.value)}
              className={input(errors.initialDonation)}
            />
          </Field>
        </Fieldset>

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
            hint="Minimum 1 day. The contract stores this as seconds, so the UI converts days for you."
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

        <div className="flex gap-3 p-4 rounded-xl bg-teal-50 border border-teal-200">
          <span className="text-lg shrink-0">ℹ️</span>
          <div className="text-sm text-teal-900">
            <p className="font-semibold">Protocol fee: 10%</p>
            <p className="text-teal-700 mt-0.5">
              10% of total deposits go to the treasury at distribution. The
              remaining 90% goes to winners, or is refunded proportionally if
              there are none.
            </p>
            <p className="text-teal-700 mt-2">
              The criteria PDF is uploaded to IPFS on submit and the link will
              be available from the pool detail page.
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
            disabled={isLoading || donating}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isLoading || donating ? "Deploying…" : "Deploy Pool"}
          </button>
        </div>
      </form>

      <Modal
        open={successModal}
        onClose={() => {
          setSuccess(false);
          navigate(
            createdPoolAddress
              ? `/dashbar/pool/${createdPoolAddress}`
              : "/dashbar/explore",
          );
        }}
        title="Pool Deployed On-Chain"
      >
        <div className="text-center py-4">
          <p className="text-5xl mb-4">🎉</p>
          <p className="text-slate-700 mb-1">
            Your pool <strong>{form.poolName}</strong> has been deployed.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            The transaction was confirmed on-chain and the new pool is ready.
          </p>
          {postDeployNotice && (
            <p className="text-sm text-slate-700 mb-4">{postDeployNotice}</p>
          )}
          {createdPoolAddress && (
            <p className="text-xs text-slate-500 font-mono mb-4 break-all">
              {createdPoolAddress}
            </p>
          )}
          <div className="flex justify-center gap-3 flex-wrap">
            {createdPoolAddress && (
              <button
                onClick={() => {
                  setSuccess(false);
                  navigate(`/dashbar/pool/${createdPoolAddress}`);
                }}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-600 transition-colors cursor-pointer"
              >
                Open Pool
              </button>
            )}
            {createdPoolAddress && (
              <a
                href={`${((import.meta.env.VITE_BLOCK_EXPLORER_BASE as string) || "https://sepolia.etherscan.io").replace(/\/$/, "")}/address/${createdPoolAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSuccess(false)}
                className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer"
              >
                View on Explorer
              </a>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

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
