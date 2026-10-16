// Catalog of on-device models. Any instruction-tuned GGUF works:
// add an entry with a direct Hugging Face "resolve" download URL.
export type ModelInfo = {
  id: string;
  name: string;
  sizeLabel: string;
  minRamGb: number;
  note: string;
  url: string;
  file: string;
};

export const MODELS: ModelInfo[] = [
  {
    id: 'qwen3-1.7b',
    name: 'Qwen3 1.7B',
    sizeLabel: '1.1 GB',
    minRamGb: 4,
    note: 'Best balance for most e-ink tablets.',
    url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
    file: 'Qwen3-1.7B-Q4_K_M.gguf',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    sizeLabel: '1.0 GB',
    minRamGb: 3,
    note: 'Lightest option. Use on older or 3 GB devices.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'llama3.2-3b',
    name: 'Llama 3.2 3B',
    sizeLabel: '2.0 GB',
    minRamGb: 6,
    note: 'Better cards and links, but slower. Needs 6 GB+ RAM.',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
];
