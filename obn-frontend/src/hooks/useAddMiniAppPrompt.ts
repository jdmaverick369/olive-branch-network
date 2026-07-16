import { useEffect, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

/**
 * Hook to prompt users to add the Olive Branch Network mini app to their library
 * Only shows the prompt if:
 * - Running inside a mini app context
 * - User hasn't already added the mini app
 * - The prompt hasn't already been shown this session
 */
export function useAddMiniAppPrompt(shouldTrigger: boolean) {
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (!shouldTrigger || promptShownRef.current) return;

    const promptAddMiniApp = async () => {
      try {
        // Check if we're running inside a mini app context
        const isMiniApp = await sdk.isInMiniApp();
        if (!isMiniApp) {
          return;
        }

        // Get the current context to check if already added
        const context = await sdk.context;
        const alreadyAdded = context.client.added;

        // Only prompt if not already added
        if (!alreadyAdded) {
          promptShownRef.current = true;
          await sdk.actions.addMiniApp();
        }
      } catch (error) {
        // Silently handle errors - SDK might not be available in all contexts
        console.debug("Mini app prompt error:", error);
      }
    };

    promptAddMiniApp();
  }, [shouldTrigger]);
}
