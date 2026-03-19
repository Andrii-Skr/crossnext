declare module "react-grab" {
  type ReactGrabOptions = {
    activationMode?: "hold" | "click";
    keyHoldDuration?: number;
    allowActivationInsideInput?: boolean;
  };

  type ReactGrabApi = {
    setOptions: (options: ReactGrabOptions) => void;
  };

  export function getGlobalApi(): ReactGrabApi | null;
}
