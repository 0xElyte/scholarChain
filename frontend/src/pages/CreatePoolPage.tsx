import { useState, useRef, useCallback, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import type { WalletState, FieldDefinition } from "../types";
import { FieldType } from "../types";
import { Modal } from "../components/Modal";
import { ABI } from "../data/ABI.js";
import { CONTRACT_ADDRESSES } from "../data/contracts";
import { cidToBytes32 } from "../hooks/usePoolDetail";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

interface Props {
  wallet: WalletState;
}

interface FormState {
  poolName: string;
  criteriaMetadataCID: string;
  submissionStart: string;
  submissionEnd: string;
  reviewDuration: string;
  signers: string[];
  initialDeposit: string;
}

const EMPTY_FORM: FormState = {
  poolName: "",
  criteriaMetadataCID: "",
  submissionStart: "",
  submissionEnd: "",
  reviewDuration: "7",
  signers: ["", "", ""],
  initialDeposit: "",
};

type FormErrors = Partial<Record<keyof FormState | "fields", string>>;

const CREATE_POOL_PHOTO =
  "https://images.unsplash.com/photo-1741699428220-65f37f3fbbcb?auto=format&fit=crop&w=1000&q=80";

export function CreatePoolPage({ wallet }: Props) {
  const navigate = useNavigate();
  const [form, setForm]               = useState<FormState>(EMPTY_FORM);
  const [fields, setFields]           = useState<FieldDefinition[]>([{ fieldType: FieldType.TEXT, label: "", required: true }]);
  const [isSubmitting, setSubmitting] = useState(false);
  const [successModal, setSuccess]    = useState(false);
  const [txHash, setTxHash]           = useState("");
  const [errors, setErrors]           = useState<FormErrors>({});

  // Criteria input mode
  const [criteriaMode, setCriteriaMode] = useState<"text" | "file">("text");
  const [criteriaText, setCriteriaText] = useState("");   // HTML from TipTap
  const [criteriaFile, setCriteriaFile] = useState<File | null>(null);
  const [ipfsStatus,   setIpfsStatus]   = useState<"idle" | "uploading" | "done">("idle");

  async function uploadToIPFS(file: File): Promise<string> {
    const jwt = (import.meta.env.VITE_PINATA_JWT ?? "") as string;
    if (!jwt) throw new Error(
      "VITE_PINATA_JWT is not set in .env.\n" +
      "Create a key at app.pinata.cloud → API Keys → New Key → enable Admin (or Pinning → pinFileToIPFS) → paste the JWT into .env → restart the dev server."
    );

    // Use the v1 pinning endpoint — it is browser/CORS-safe.
    // Required scope: Admin  OR  Pinning → pinFileToIPFS
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("pinataMetadata", JSON.stringify({ name: file.name }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method:  "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body:    fd,
    });

    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }

      if (res.status === 401) throw new Error(
        "Pinata: Unauthorized (401) — your JWT is invalid or expired.\n" +
        "Regenerate it at app.pinata.cloud → API Keys."
      );
      if (res.status === 403) throw new Error(
        "Pinata: Forbidden (403) — the key is missing the required scope.\n" +
        "Fix: app.pinata.cloud → API Keys → New Key → enable Admin (or Pinning → pinFileToIPFS) → update VITE_PINATA_JWT."
      );
      throw new Error(`IPFS upload failed (${res.status}): ${body.slice(0, 160)}`);
    }

    const data = (await res.json()) as { IpfsHash: string };
    return data.IpfsHash;
  }

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
    if (!form.poolName.trim())              e.poolName             = "Required.";
    if (criteriaMode === "text" && !criteriaText.replace(/<[^>]+>/g, "").trim())
                                            e.criteriaMetadataCID  = "Please write the criteria description.";
    if (criteriaMode === "file" && !criteriaFile)
                                            e.criteriaMetadataCID  = "Please select a PDF, DOCX, or Markdown file.";
    if (!form.submissionStart)              e.submissionStart      = "Required.";
    if (!form.submissionEnd)                e.submissionEnd        = "Required.";
    if (form.submissionStart && form.submissionEnd) {
      const s  = new Date(form.submissionStart).getTime() / 1000;
      const e2 = new Date(form.submissionEnd).getTime()   / 1000;
      if (s <= Date.now() / 1000) e.submissionStart = "Must be in the future.";
      if (e2 <= s + 86400)        e.submissionEnd   = "Must be at least 1 day after start.";
    }
    if (Number(form.reviewDuration) < 1)    e.reviewDuration = "Minimum 1 day.";
    const validSigners = form.signers.filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s.trim()));
    if (validSigners.length < 3)            e.signers  = "Need at least 3 valid 0x addresses.";
    if (fields.some((f) => !f.label.trim())) e.fields  = "All field labels are required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!validate()) return;
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

    setSubmitting(true);
    let finalCID = "";
    try {
      // ── Step 1: Upload criteria to IPFS ──
      setIpfsStatus("uploading");
      if (criteriaMode === "text") {
        const safeName = form.poolName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
        const blob = new Blob([criteriaText], { type: "text/html;charset=utf-8" });
        const file = new File([blob], `${safeName || "criteria"}-criteria.html`, { type: "text/html" });
        finalCID = await uploadToIPFS(file);
      } else {
        finalCID = await uploadToIPFS(criteriaFile!);
      }
      setIpfsStatus("done");

      // ── Step 2: Deploy pool on-chain ──
      const provider = new BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const factory  = new Contract(CONTRACT_ADDRESSES.ScholarChainFactory, ABI.Factory, signer);

      const submissionStartTs = Math.floor(new Date(form.submissionStart).getTime() / 1000);
      const submissionEndTs   = Math.floor(new Date(form.submissionEnd).getTime()   / 1000);
      const reviewDurationSec = Number(form.reviewDuration) * 86400;
      const validSigners      = form.signers.filter((s) => /^0x[0-9a-fA-F]{40}$/.test(s.trim()));

      // Map FieldType string → uint8
      const FIELD_TYPE_NUM: Record<FieldType, number> = {
        [FieldType.TEXT]:     0,
        [FieldType.URL]:      1,
        [FieldType.DOCUMENT]: 2,
      };

      const params = {
        poolName:            form.poolName.trim(),
        criteriaMetadataCID: cidToBytes32(finalCID),
        submissionStart:     submissionStartTs,
        submissionEnd:       submissionEndTs,
        reviewDuration:      reviewDurationSec,
        initialSigners:      validSigners,
        usdtTokenAddress:    CONTRACT_ADDRESSES.MockUSDT,
        fieldDefinitions:    fields.map((f) => ({
          fieldType: FIELD_TYPE_NUM[f.fieldType],
          label:     f.label,
          required:  f.required,
        })),
      };

      // Deploy pool
      const tx = await factory.createPool(params);
      const receipt = await tx.wait();
      setTxHash(receipt?.hash ?? tx.hash ?? "");

      // Optional: initial deposit after pool creation
      if (form.initialDeposit && parseFloat(form.initialDeposit) > 0) {
        const depositRaw = parseUnits(form.initialDeposit, 6);
        // Get pool address from getAllPools last entry
        const allPools: string[] = await factory.getAllPools();
        const newPoolAddress = allPools[allPools.length - 1];

        if (newPoolAddress) {
          const usdt    = new Contract(CONTRACT_ADDRESSES.MockUSDT, ABI.MockUsdt, signer);
          const approveTx = await usdt.approve(newPoolAddress, depositRaw);
          await approveTx.wait();
          const pool    = new Contract(newPoolAddress, ABI.GrantPool, signer);
          const donateTx = await pool.donate(depositRaw);
          await donateTx.wait();
        }
      }

      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        console.error("createPool error:", err);
        alert(`Error: ${msg.slice(0, 160)}`);
      }
    } finally {
      setSubmitting(false);
      setIpfsStatus("idle");
    }
  }

  if (!wallet.isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-5xl mb-4">🔒</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Wallet not connected</h2>
        <p className="text-slate-500 text-sm">Connect your wallet to create a grant pool.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="scholar-card-strong rounded-3xl overflow-hidden mb-8">
        <div className="grid md:grid-cols-[1fr_320px]">
          <div className="p-7 sm:p-8">
            <p className="text-xs font-extrabold text-teal-700 uppercase tracking-[0.22em] mb-3">Launch funding</p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#07182b] mb-2">Create a Grant Pool</h1>
            <p className="text-sm text-slate-500 max-w-xl">
              All parameters are set at deploy time and stored immutably on-chain.
            </p>
          </div>
          <img
            src={CREATE_POOL_PHOTO}
            alt="Student working from a library"
            className="hidden md:block h-full min-h-[190px] w-full object-cover"
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">

        {/* ── Pool Identity ── */}
        <Fieldset title="Pool Identity">
          <Field label="Pool Name" error={errors.poolName} required>
            <input
              type="text" maxLength={100}
              placeholder="e.g. Web3 Developer Scholarship 2025"
              value={form.poolName}
              onChange={(e) => setField("poolName", e.target.value)}
              className={input(errors.poolName)}
            />
          </Field>
        </Fieldset>

        {/* ── Criteria Description ── */}
        <Fieldset title="Criteria Description" desc="Describe what applicants need to meet. This will be uploaded to IPFS automatically.">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 shrink-0">Input method</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => { setCriteriaMode("text"); setCriteriaFile(null); }}
                className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  criteriaMode === "text"
                    ? "bg-[#07182b] text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                ✍️ Text Editor
              </button>
              <button
                type="button"
                onClick={() => { setCriteriaMode("file"); setCriteriaText(""); }}
                className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-slate-200 ${
                  criteriaMode === "file"
                    ? "bg-[#07182b] text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                📎 File Upload
              </button>
            </div>
          </div>

          {criteriaMode === "text" ? (
            <Field label="Criteria Content" error={errors.criteriaMetadataCID} required>
              <RichTextEditor
                onChange={setCriteriaText}
                hasError={!!errors.criteriaMetadataCID}
              />
            </Field>
          ) : (
            <Field
              label="Upload File"
              hint="Accepted: PDF, DOCX, Markdown (.md). Will be pinned to IPFS on submission."
              error={errors.criteriaMetadataCID}
              required
            >
              <FileDropZone file={criteriaFile} onFile={(f) => { setCriteriaFile(f); setErrors((e) => ({ ...e, criteriaMetadataCID: undefined })); }} />
            </Field>
          )}

          {!import.meta.env.VITE_PINATA_JWT && (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span className="shrink-0">⚠️</span>
              <span>
                <strong>VITE_PINATA_JWT</strong> not set.{" "}
                Go to{" "}
                <a href="https://app.pinata.cloud" target="_blank" rel="noreferrer" className="underline font-medium">app.pinata.cloud</a>
                {" → API Keys → New Key → enable "}
                <strong>Admin</strong> (or <strong>Pinning → pinFileToIPFS</strong>)
                {" → paste the JWT into your "}
                <code className="bg-amber-100 px-1 rounded">.env</code>
                {" as "}
                <code className="bg-amber-100 px-1 rounded">VITE_PINATA_JWT=…</code>
                {" → restart dev server."}
              </span>
            </div>
          )}
        </Fieldset>

        {/* ── Timing ── */}
        <Fieldset title="Timing">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Submission Opens" error={errors.submissionStart} required>
              <input type="datetime-local" value={form.submissionStart}
                onChange={(e) => setField("submissionStart", e.target.value)}
                className={input(errors.submissionStart)} />
            </Field>
            <Field label="Submission Closes" error={errors.submissionEnd} required>
              <input type="datetime-local" value={form.submissionEnd}
                onChange={(e) => setField("submissionEnd", e.target.value)}
                className={input(errors.submissionEnd)} />
            </Field>
          </div>
          <Field label="Review Duration (days)" error={errors.reviewDuration} hint="Minimum 1 day. How long reviewers have after submissions close." required>
            <input type="number" min={1} max={90} value={form.reviewDuration}
              onChange={(e) => setField("reviewDuration", e.target.value)}
              className={`${input(errors.reviewDuration)} max-w-[120px]`} />
          </Field>
        </Fieldset>

        {/* ── Review panel ── */}
        <Fieldset title="Review Panel" desc="At least 3 Ethereum addresses. Approval requires 70% quorum. List locks when submissions open.">
          {errors.signers && <p className="text-xs text-red-600 mb-2">{errors.signers}</p>}
          <div className="space-y-2">
            {form.signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-5 text-right shrink-0">{i + 1}</span>
                <input
                  type="text" placeholder="0x…" value={s}
                  onChange={(e) => setSigner(i, e.target.value)}
                  className="scholar-input flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
                {form.signers.length > 3 && (
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, signers: f.signers.filter((_, idx) => idx !== i) }))}
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer">✕</button>
                )}
              </div>
            ))}
          </div>
          {form.signers.length < 20 && (
            <button type="button"
              onClick={() => setForm((f) => ({ ...f, signers: [...f.signers, ""] }))}
              className="mt-2 text-sm text-teal-700 hover:underline cursor-pointer">+ Add Reviewer</button>
          )}
        </Fieldset>

        {/* ── Funding ── */}
        <Fieldset title="Funding">
          <div className="flex gap-2 p-3 rounded-xl bg-teal-50 border border-teal-200 mb-2">
            <span className="text-sm shrink-0">ℹ️</span>
            <p className="text-xs text-teal-800">
              The pool will use <strong>MockUSDT</strong> ({CONTRACT_ADDRESSES.MockUSDT.slice(0, 10)}…) on Sepolia.
            </p>
          </div>
          <Field label="Initial Deposit (USDT)" hint="Optional. Requires an ERC-20 approve step before the pool tx.">
            <input type="number" min={0} placeholder="0"
              value={form.initialDeposit}
              onChange={(e) => setField("initialDeposit", e.target.value)}
              className={`${input()} max-w-[160px]`} />
          </Field>
        </Fieldset>

        {/* ── Application form schema ── */}
        <Fieldset title="Application Form Schema" desc="Fields applicants must fill in. Stored on-chain. Max 10 fields.">
          {errors.fields && <p className="text-xs text-red-600 mb-2">{errors.fields}</p>}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 w-5 text-right shrink-0">{i + 1}</span>
                <select
                  value={f.fieldType}
                  onChange={(e) => setFields((prev) => prev.map((x, idx) => idx === i ? { ...x, fieldType: e.target.value as FieldType } : x))}
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
                  onChange={(e) => setFields((prev) => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                  className="scholar-input flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-0"
                />
                <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={f.required}
                    onChange={(e) => setFields((prev) => prev.map((x, idx) => idx === i ? { ...x, required: e.target.checked } : x))}
                    className="rounded" />
                  Required
                </label>
                {fields.length > 1 && (
                  <button type="button"
                    onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer">✕</button>
                )}
              </div>
            ))}
          </div>
          {fields.length < 10 && (
            <button type="button"
              onClick={() => setFields((prev) => [...prev, { fieldType: FieldType.TEXT, label: "", required: true }])}
              className="mt-2 text-sm text-teal-700 hover:underline cursor-pointer">+ Add Field</button>
          )}
        </Fieldset>

        {/* Fee notice */}
        <div className="flex gap-3 p-4 rounded-xl bg-teal-50 border border-teal-200">
          <span className="text-lg shrink-0">ℹ️</span>
          <div className="text-sm text-teal-900">
            <p className="font-semibold">Protocol fee: 10%</p>
            <p className="text-teal-700 mt-0.5">10% of total deposits go to the ScholarChain treasury at distribution.</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer">
            {isSubmitting
              ? ipfsStatus === "uploading" ? "⏳ Uploading to IPFS…" : "⛓ Deploying on-chain…"
              : "Deploy Pool"}
          </button>
        </div>
      </form>

      <Modal open={successModal} onClose={() => { setSuccess(false); setForm(EMPTY_FORM); setCriteriaText(""); setCriteriaFile(null); navigate("/dashbar/explore"); }} title="Pool Deployed!">
        <div className="text-center py-4">
          <p className="text-5xl mb-4">🎉</p>
          <p className="text-slate-700 mb-1">
            Your pool <strong>{form.poolName}</strong> has been deployed on Sepolia.
          </p>
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              className="text-xs text-teal-700 hover:underline break-all mb-4 block"
            >
              View on Etherscan ↗
            </a>
          )}
          <button
            onClick={() => { setSuccess(false); setForm(EMPTY_FORM); setCriteriaText(""); setCriteriaFile(null); navigate("/dashbar/explore"); }}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer">
            View in Explorer
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ── Small helpers ── */
function Fieldset({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="scholar-card rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-1">{title}</h2>
      {desc && <p className="text-xs text-slate-500 mb-4">{desc}</p>}
      <div className="space-y-4 mt-3">{children}</div>
    </div>
  );
}

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint  && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function input(error?: string) {
  return `scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
    error ? "border-red-400 focus:ring-red-400" : "border-slate-300 focus:ring-teal-500"
  }`;
}

/* ── RichTextEditor (TipTap) ── */
function RichTextEditor({ onChange, hasError }: { onChange: (html: string) => void; hasError?: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Describe the scholarship criteria, eligibility requirements, evaluation rubric, and anything applicants should know…",
      }),
    ],
    onUpdate({ editor: e }) {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: { class: "ProseMirror" },
    },
  });

  const btn = useCallback(
    (label: string, title: string, active: boolean, onClick: () => void) => (
      <button
        key={title}
        type="button"
        title={title}
        onMouseDown={(e) => { e.preventDefault(); onClick(); }}
        className={`tiptap-btn${active ? " active" : ""}`}
      >
        {label}
      </button>
    ),
    []
  );

  if (!editor) return null;

  return (
    <div className={`tiptap-wrapper${hasError ? " error" : ""}`}>
      {/* Toolbar */}
      <div className="tiptap-toolbar">
        {btn("B",  "Bold",          editor.isActive("bold"),       () => editor.chain().focus().toggleBold().run())}
        {btn("I",  "Italic",        editor.isActive("italic"),     () => editor.chain().focus().toggleItalic().run())}
        {btn("S̶",  "Strikethrough", editor.isActive("strike"),     () => editor.chain().focus().toggleStrike().run())}
        <span className="tiptap-divider" />
        {btn("H1", "Heading 1",     editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
        {btn("H2", "Heading 2",     editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {btn("H3", "Heading 3",     editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        <span className="tiptap-divider" />
        {btn("≡",  "Bullet List",   editor.isActive("bulletList"),   () => editor.chain().focus().toggleBulletList().run())}
        {btn("1.",  "Ordered List", editor.isActive("orderedList"),  () => editor.chain().focus().toggleOrderedList().run())}
        {btn("❝",  "Blockquote",    editor.isActive("blockquote"),   () => editor.chain().focus().toggleBlockquote().run())}
        <span className="tiptap-divider" />
        {btn("↩",  "Undo",  false, () => editor.chain().focus().undo().run())}
        {btn("↪",  "Redo",  false, () => editor.chain().focus().redo().run())}
      </div>
      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}

/* ── FileDropZone ── */
function FileDropZone({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const ACCEPTED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown", "text/plain"];
  const ACCEPT_EXT = ".pdf,.docx,.md,.txt";

  function handleFiles(fileList: FileList | null) {
    const f = fileList?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type) && !f.name.match(/\.(pdf|docx|md|txt)$/i)) {
      alert("Unsupported file type. Please upload PDF, DOCX, or Markdown.");
      return;
    }
    onFile(f);
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
        dragging
          ? "border-teal-500 bg-teal-50"
          : file
            ? "border-emerald-400 bg-emerald-50"
            : "border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_EXT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {file ? (
        <>
          <span className="text-3xl">📄</span>
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-800">{file.name}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Ready to upload</p>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onFile(null as unknown as File); }}
            className="text-xs text-red-500 hover:text-red-700 underline cursor-pointer"
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <span className="text-4xl">{dragging ? "📂" : "☁️"}</span>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">
              {dragging ? "Drop file here" : "Drag & drop or click to browse"}
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF, DOCX, or Markdown · Max 50 MB</p>
          </div>
        </>
      )}
    </div>
  );
}
