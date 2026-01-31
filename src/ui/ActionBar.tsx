import React from 'react';
import {
	Cursor,
	Square,
	TextAlignLeft,
	Hand,
	ArrowCounterClockwise,
	ArrowClockwise,
	Save,
	Folder,
	Image,
} from 'akar-icons';

export type Tool = 'select' | 'rectangle' | 'text' | 'hand';

interface ActionBarProps {
	activeTool: Tool;
	onToolChange: (tool: Tool) => void;
	canUndo?: boolean;
	canRedo?: boolean;
	onUndo?: () => void;
	onRedo?: () => void;
	onSave?: () => void;
	onLoad?: () => void;
	onImport?: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
	activeTool,
	onToolChange,
	canUndo = false,
	canRedo = false,
	onUndo,
	onRedo,
	onSave,
	onLoad,
	onImport,
}) => {
	const tools = [
		{ id: 'select' as const, label: 'Select', shortcut: 'V', icon: <Cursor strokeWidth={2} size={18} /> },
		{ id: 'hand' as const, label: 'Hand', shortcut: 'H', icon: <Hand strokeWidth={2} size={18} /> },
		{ id: 'rectangle' as const, label: 'Rectangle', shortcut: 'R', icon: <Square strokeWidth={2} size={18} /> },
		{ id: 'text' as const, label: 'Text', shortcut: 'T', icon: <TextAlignLeft strokeWidth={2} size={18} /> },
	];

	return (
		<div
			style={{
				position: 'absolute',
				bottom: '16px',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: '2px',
				padding: '6px',
				backgroundColor: '#2d2d2d',
				borderRadius: '12px',
				boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.08)',
				zIndex: 100,
			}}
		>
			{tools.map((tool, index) => (
				<React.Fragment key={tool.id}>
					{/* Divider between select/hand group and shape tools */}
					{index === 2 && (
						<div
							style={{
								width: '1px',
								height: '24px',
								backgroundColor: '#555',
								margin: '0 4px',
							}}
						/>
					)}
					<button
						type="button"
						onClick={() => onToolChange(tool.id)}
						title={`${tool.label} (${tool.shortcut})`}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '36px',
							height: '36px',
							padding: '0',
							backgroundColor: activeTool === tool.id ? '#4a9eff' : 'transparent',
							color: activeTool === tool.id ? 'white' : '#aaa',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer',
							transition: 'background-color 0.15s, color 0.15s',
						}}
					>
						{tool.icon}
					</button>
				</React.Fragment>
			))}

			{/* Divider before utility buttons */}
			<div
				style={{
					width: '1px',
					height: '24px',
					backgroundColor: '#555',
					margin: '0 4px',
				}}
			/>

			{/* Undo */}
			<button
				type="button"
				onClick={onUndo}
				disabled={!canUndo}
				title="Undo (Ctrl+Z)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					padding: '0',
					backgroundColor: 'transparent',
					color: canUndo ? '#aaa' : '#555',
					border: 'none',
					borderRadius: '8px',
					cursor: canUndo ? 'pointer' : 'not-allowed',
					transition: 'color 0.15s',
				}}
			>
				<ArrowCounterClockwise strokeWidth={2} size={18} />
			</button>

			{/* Redo */}
			<button
				type="button"
				onClick={onRedo}
				disabled={!canRedo}
				title="Redo (Ctrl+Shift+Z)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					padding: '0',
					backgroundColor: 'transparent',
					color: canRedo ? '#aaa' : '#555',
					border: 'none',
					borderRadius: '8px',
					cursor: canRedo ? 'pointer' : 'not-allowed',
					transition: 'color 0.15s',
				}}
			>
				<ArrowClockwise strokeWidth={2} size={18} />
			</button>

			{/* Divider before file actions */}
			<div
				style={{
					width: '1px',
					height: '24px',
					backgroundColor: '#555',
					margin: '0 4px',
				}}
			/>

			{/* Save */}
			<button
				type="button"
				onClick={onSave}
				title="Save (Ctrl+S)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					padding: '0',
					backgroundColor: 'transparent',
					color: '#aaa',
					border: 'none',
					borderRadius: '8px',
					cursor: 'pointer',
					transition: 'color 0.15s',
				}}
			>
				<Save strokeWidth={2} size={18} />
			</button>

			{/* Load */}
			<button
				type="button"
				onClick={onLoad}
				title="Open (Ctrl+O)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					padding: '0',
					backgroundColor: 'transparent',
					color: '#aaa',
					border: 'none',
					borderRadius: '8px',
					cursor: 'pointer',
					transition: 'color 0.15s',
				}}
			>
				<Folder strokeWidth={2} size={18} />
			</button>

			{/* Import */}
			<button
				type="button"
				onClick={onImport}
				title="Import Image (Ctrl+I)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '36px',
					height: '36px',
					padding: '0',
					backgroundColor: 'transparent',
					color: '#aaa',
					border: 'none',
					borderRadius: '8px',
					cursor: 'pointer',
					transition: 'color 0.15s',
				}}
			>
				<Image strokeWidth={2} size={18} />
			</button>
		</div>
	);
};
