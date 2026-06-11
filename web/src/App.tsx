import { AppFrame, ToastProvider } from './components';
import { Root } from './screens/Root';

/**
 * Thin application shell.
 *
 * Renders the design-system <AppFrame> (header + theme toggle) around the
 * <Root> router, which shows the ConnectScreen when disconnected and the
 * LobbyScreen once connected (and the GameScreen in later phases).
 */
export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppFrame>
        <Root />
      </AppFrame>
    </ToastProvider>
  );
}
