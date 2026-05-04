const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

interface PinataPinResponse {
  IpfsHash?: string;
  error?: { message?: string; reason?: string; details?: any };
  message?: string;
}

function getPinataJwt(): string {
  const jwt = import.meta.env.VITE_PINATA_JWT as string | undefined;
  if (!jwt) {
    throw new Error(
      "Pinata JWT not configured. Set VITE_PINATA_JWT in frontend/.env.local",
    );
  }
  return jwt;
}

export async function uploadPdfToPinata(
  file: File,
  name: string,
): Promise<string> {
  if (file.type !== "application/pdf") {
    throw new Error("Please select a PDF file.");
  }

  return uploadFileToPinata(file, name);
}

export async function uploadFileToPinata(
  file: File,
  name: string,
): Promise<string> {
  if (!file) {
    throw new Error("Please select a file to upload.");
  }

  const jwt = getPinataJwt();
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: name,
      keyvalues: {
        mimeType: file.type,
      },
    }),
  );
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

  let response: Response;
  try {
    response = await fetch(PINATA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });
  } catch (err) {
    throw new Error(
      "Failed to reach Pinata. Check your internet connection and try again.",
    );
  }

  const payload = (await response.json()) as PinataPinResponse;

  if (!response.ok) {
    if (
      response.status === 403 &&
      (payload?.error?.reason === "NO_SCOPES_FOUND" ||
        payload?.error?.reason === "API_KEY_REVOKED")
    ) {
      throw new Error(
        "Pinata API key issue: " +
          (payload?.error?.details ||
            "Check your API key has write/pinning permissions and is not revoked."),
      );
    }

    throw new Error(
      payload.error?.message ??
        payload.message ??
        "Failed to upload file to Pinata.",
    );
  }

  if (!payload.IpfsHash) {
    throw new Error("Upload did not return an IPFS hash.");
  }

  return payload.IpfsHash;
}
