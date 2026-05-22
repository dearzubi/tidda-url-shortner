import { useMutation } from '@tanstack/react-query';
import { env } from '@/config/env.js';
import { createLink } from '@/lib/api/link-api.js';

export function useCreateLink() {
  return useMutation({
    mutationFn: (destinationUrl: string) =>
      createLink({
        apiBaseUrl: env.VITE_API_URL,
        destinationUrl,
      }),
  });
}
