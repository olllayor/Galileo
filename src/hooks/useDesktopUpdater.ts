import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { isTauri } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

export type AvailableUpdate = {
	currentVersion: string;
	version: string;
	body: string | null;
	date: string | null;
};

type UseDesktopUpdaterOptions = {
	onToast: (message: string, loading?: boolean) => void;
	launchCheckDelayMs?: number;
};

const DEFAULT_VERSION = import.meta.env.DEV ? 'dev' : 'unknown';

const formatUpdaterError = (error: unknown, fallback: string) => {
	if (!(error instanceof Error) || !error.message.trim()) {
		return fallback;
	}
	return `${fallback.replace(/\.$/, '')}: ${error.message.trim()}`;
};

export const useDesktopUpdater = ({
	onToast,
	launchCheckDelayMs = 1400,
}: UseDesktopUpdaterOptions) => {
	const updaterRef = useRef<Update | null>(null);
	const launchCheckScheduledRef = useRef(false);
	const [appVersion, setAppVersion] = useState(DEFAULT_VERSION);
	const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
	const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
	const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
	const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

	const isPackagedDesktopApp = isTauri() && !import.meta.env.DEV;

	const clearUpdateResource = useCallback(async () => {
		const activeUpdate = updaterRef.current;
		updaterRef.current = null;
		if (!activeUpdate) return;
		try {
			await activeUpdate.close();
		} catch {
			// Ignore resource cleanup failures; the updater state is already being reset.
		}
	}, []);

	const clearUpdatePrompt = useCallback(() => {
		setIsUpdateModalOpen(false);
		setAvailableUpdate(null);
		void clearUpdateResource();
	}, [clearUpdateResource]);

	const runUpdateCheck = useCallback(
		async ({ silentErrors, silentNoUpdate }: { silentErrors: boolean; silentNoUpdate: boolean }) => {
			if (!isPackagedDesktopApp || isCheckingForUpdate || isInstallingUpdate) {
				if (!isPackagedDesktopApp && !silentErrors) {
					onToast('Updates are only available in the packaged Galileo app.');
				}
				return;
			}

			setIsCheckingForUpdate(true);
			try {
				const update = await check();
				if (!update) {
					clearUpdatePrompt();
					if (!silentNoUpdate) {
						onToast('Galileo is up to date.');
					}
					return;
				}

				await clearUpdateResource();
				updaterRef.current = update;
				setAvailableUpdate({
					currentVersion: appVersion !== DEFAULT_VERSION ? appVersion : update.currentVersion,
					version: update.version,
					body: update.body?.trim() || null,
					date: update.date ?? null,
				});
				setIsUpdateModalOpen(true);
			} catch (error) {
				clearUpdatePrompt();
				if (!silentErrors) {
					onToast(formatUpdaterError(error, 'Failed to check for updates.'));
				}
			} finally {
				setIsCheckingForUpdate(false);
			}
		},
		[appVersion, clearUpdatePrompt, clearUpdateResource, isCheckingForUpdate, isInstallingUpdate, isPackagedDesktopApp, onToast],
	);

	const checkForUpdates = useCallback(async () => {
		await runUpdateCheck({ silentErrors: false, silentNoUpdate: false });
	}, [runUpdateCheck]);

	const installAvailableUpdate = useCallback(async () => {
		const update = updaterRef.current;
		if (!update || isInstallingUpdate) return;

		setIsInstallingUpdate(true);
		try {
			let totalBytes = 0;
			let downloadedBytes = 0;
			const handleDownloadEvent = (event: DownloadEvent) => {
				if (event.event === 'Started') {
					totalBytes = event.data.contentLength ?? 0;
					downloadedBytes = 0;
					onToast('Downloading update...', true);
					return;
				}

				if (event.event === 'Progress') {
					downloadedBytes += event.data.chunkLength;
					if (totalBytes > 0) {
						const progress = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
						onToast(`Downloading update... ${progress}%`, true);
						return;
					}
					onToast('Downloading update...', true);
					return;
				}

				onToast('Installing update...', true);
			};

			onToast('Preparing update...', true);
			await update.downloadAndInstall(handleDownloadEvent);
			setIsUpdateModalOpen(false);
			setAvailableUpdate(null);
			onToast('Update installed. Restart Galileo to finish.');
			await clearUpdateResource();
		} catch (error) {
			setIsUpdateModalOpen(false);
			setAvailableUpdate(null);
			await clearUpdateResource();
			onToast(formatUpdaterError(error, 'Failed to install update.'));
		} finally {
			setIsInstallingUpdate(false);
		}
	}, [clearUpdateResource, isInstallingUpdate, onToast]);

	useEffect(() => {
		if (!isTauri()) return;
		let cancelled = false;

		void getVersion()
			.then((version) => {
				if (!cancelled) {
					setAppVersion(version);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setAppVersion(DEFAULT_VERSION);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!isPackagedDesktopApp || launchCheckScheduledRef.current) return;
		launchCheckScheduledRef.current = true;
		const timer = window.setTimeout(() => {
			void runUpdateCheck({ silentErrors: true, silentNoUpdate: true });
		}, launchCheckDelayMs);
		return () => {
			window.clearTimeout(timer);
		};
	}, [isPackagedDesktopApp, launchCheckDelayMs, runUpdateCheck]);

	useEffect(() => {
		return () => {
			void clearUpdateResource();
		};
	}, [clearUpdateResource]);

	return {
		appVersion,
		availableUpdate,
		checkForUpdates,
		clearUpdatePrompt,
		installAvailableUpdate,
		isCheckingForUpdate,
		isInstallingUpdate,
		isPackagedDesktopApp,
		isUpdateModalOpen,
	};
};
