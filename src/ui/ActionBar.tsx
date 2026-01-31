import React from 'react';
import { Cursor, Square, TextAlignLeft, Hand, Save, Folder, Image } from 'akar-icons';

export type Tool = 'select' | 'rectangle' | 'text' | 'hand';

interface ActionBarProps {
	activeTool: Tool;
	onToolChange: (tool: Tool) => void;
	onSave?: () => void;
	onLoad?: () => void;
	onImport?: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
	activeTool,
	onToolChange,
	onSave,
	onLoad,
	onImport,
}) => {
	const tools = [
		{ id: 'select' as const, label: 'Select', shortcut: 'V', icon: <Cursor strokeWidth={2} size={16} /> },
		{ id: 'hand' as const, label: 'Hand', shortcut: 'H', icon: <Hand strokeWidth={2} size={16} /> },
		{ id: 'rectangle' as const, label: 'Rectangle', shortcut: 'R', icon: <Square strokeWidth={2} size={16} /> },
		{ id: 'text' as const, label: 'Text', shortcut: 'T', icon: <TextAlignLeft strokeWidth={2} size={16} /> },
	];

	return (
		<div
			style={{
				position: 'absolute',
				bottom: '12px',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				alignItems: 'center',
				gap: '1px',
				padding: '4px',
				backgroundColor: 'rgba(30, 30, 30, 0.85)',
				backdropFilter: 'blur(20px)',
				WebkitBackdropFilter: 'blur(20px)',
				borderRadius: '10px',
				boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4), inset 0 0.5px 0 rgba(255, 255, 255, 0.1)',
				border: '0.5px solid rgba(255, 255, 255, 0.1)',
				zIndex: 100,
			}}
		>
			{tools.map((tool, index) => (
				<React.Fragment key={tool.id}>
					{index === 2 && (
						<div
							style={{
								width: '1px',
								height: '20px',
								backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
							width: '32px',
							height: '32px',
							padding: '0',
							backgroundColor: activeTool === tool.id ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
							color: activeTool === tool.id ? '#fff' : 'rgba(255, 255, 255, 0.6)',
							border: 'none',
							borderRadius: '6px',
							cursor: 'pointer',
							transition: 'all 0.15s ease',
						}}
					>
						{tool.icon}
					</button>
				</React.Fragment>
			))}

			{/* Divider */}
			<div
				style={{
					width: '1px',
					height: '20px',
					backgroundColor: 'rgba(255, 255, 255, 0.15)',
					margin: '0 4px',
				}}
			/>

			{/* File actions */}
			<button
				type="button"
				onClick={onSave}
				title="Save (⌘S)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '32px',
					height: '32px',
					padding: '0',
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
					border: 'none',
					borderRadius: '6px',
					cursor: 'pointer',
					transition: 'all 0.15s ease',
				}}
			>
				<Save strokeWidth={2} size={16} />
			</button>

			<button
				type="button"
				onClick={onLoad}
				title="Open (⌘O)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '32px',
					height: '32px',
					padding: '0',
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
					border: 'none',
					borderRadius: '6px',
					cursor: 'pointer',
					transition: 'all 0.15s ease',
				}}
			>
				<Folder strokeWidth={2} size={16} />
			</button>

			<button
				type="button"
				onClick={onImport}
				title="Import Image (⌘I)"
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '32px',
					height: '32px',
					padding: '0',
					backgroundColor: 'transparent',
					color: 'rgba(255, 255, 255, 0.6)',
					border: 'none',
					borderRadius: '6px',
					cursor: 'pointer',
					transition: 'all 0.15s ease',
				}}
			>
				<Image strokeWidth={2} size={16} />
			</button>
		</div>
	);
};
