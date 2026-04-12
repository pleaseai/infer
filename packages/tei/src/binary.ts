const BINARY_NAME = "text-embeddings-router";
const INSTALL_MSG =
  "To install: brew install huggingface/tap/text-embeddings-inference";

type WhichFn = (name: string) => string | null;

/**
 * Finds the text-embeddings-router binary on $PATH.
 * @param which - Optional lookup function (defaults to Bun.which). Injectable for testing.
 * @returns Absolute path to the binary.
 * @throws Error if the binary is not found, with installation instructions.
 */
export function findTeiBinary(which: WhichFn = Bun.which): string {
  const path = which(BINARY_NAME);

  if (!path) {
    throw new Error(
      `${BINARY_NAME} not found on $PATH.\n${INSTALL_MSG}`
    );
  }

  return path;
}
