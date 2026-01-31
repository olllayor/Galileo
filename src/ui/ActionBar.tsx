import React from 'react';
import { Cursor, Square, TextAlignLeft, Hand, Image } from 'akar-icons';

export type Tool = 'select' | 'rectangle' | 'text' | 'hand';

interface ActionBarProps {
	activeTool: Tool;
	onToolChange: (tool: Tool) => void;
	onImport?: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ activeTool, onToolChange, onImport }) => {
	const tools = [
		{ id: 'select' as const, label: 'Select', shortcut: 'V', icon: <Cursor strokeWidth={2} size={15} /> },
		{ id: 'hand' as const, label: 'Hand', shortcut: 'H', icon: <Hand strokeWidth={2} size={15} /> },
		{ id: 'rectangle' as const, label: 'Rectangle', shortcut: 'R', icon: <Square strokeWidth={2} size={15} /> },
		{ id: 'text' as const, label: 'Text', shortcut: 'T', icon: <TextAlignLeft strokeWidth={2} size={15} /> },
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
				backgroundColor: 'rgba(28, 28, 30, 0.8)',
				borderRadius: '12px',
				boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.05)',
				backdropFilter: 'blur(40px) saturate(180%)',
				WebkitBackdropFilter: 'blur(40px) saturate(180%)',
				zIndex: 100,
			}}
		>
			{tools.map((tool, index) => (
				<React.Fragment key={tool.id}>
					{index === 2 && (
						<div
							style={{
								width: '1px',
								height: '18px',
								backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
							width: '30px',
							height: '30px',
							padding: '0',
							backgroundColor: activeTool === tool.id ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
							color: activeTool === tool.id ? '#fff' : 'rgba(255, 255, 255, 0.55)',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer',
							transition: 'all 0.15s ease',
						}}
					>
						{tool.icon}
					</button>
				</React.Fragment>
			))}

			{onImport && (
				<>
					<div
						style={{
							width: '1px',
							height: '18px',
							backgroundColor: 'rgba(255, 255, 255, 0.08)',
							margin: '0 4px',
						}}
					/>
					<button
						type="button"
						onClick={onImport}
						title="Import Image (⌘I)"
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: '30px',
							height: '30px',
							padding: '0',
							backgroundColor: 'transparent',
							color: 'rgba(255, 255, 255, 0.55)',
							border: 'none',
							borderRadius: '8px',
							cursor: 'pointer',
							transition: 'all 0.15s ease',
						}}
					>
						<Image strokeWidth={2} size={15} />
					</button>
				</>
			)}
		</div>
	);
};
