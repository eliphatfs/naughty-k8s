import { provideVSCodeDesignSystem, vsCodeButton, vsCodeTextField } from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextField());
