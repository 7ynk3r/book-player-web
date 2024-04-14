import { useEffect, useRef } from 'react';

function useAsyncEffect(callback, dependencies) {
  const hasUnmounted = useRef(false);

  useEffect(() => {
    hasUnmounted.current = false;

    const runAsync = async () => {
      try {
        // Call the async callback
        const cleanup = await callback();

        // If a cleanup function is returned, return it from the effect
        if (typeof cleanup === 'function') {
          return () => {
            // Only run cleanup if the component has not unmounted
            if (!hasUnmounted.current) {
              cleanup();
            }
          };
        }
      } catch (error) {
        console.error('Error in useAsyncEffect:', error);
      }
    };

    // Execute the async function
    runAsync();

    // Update unmount status
    return () => {
      hasUnmounted.current = true;
    };
  }, dependencies);
}

export default useAsyncEffect;