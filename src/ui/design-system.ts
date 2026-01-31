/**
 * Galileo Design System - Figma-inspired professional design tokens
 *
 * This system provides consistent styling across the application,
 * optimized for professional designer workflows.
 */

export const colors = {
	// Background colors - macOS native feel
	bg: {
		primary: '#1c1c1e', // Main app background (matches macOS dark)
		secondary: 'rgba(28, 28, 30, 0.85)', // Panel backgrounds with transparency
		tertiary: 'rgba(44, 44, 46, 0.9)', // Elevated surfaces
		canvas: '#141416', // Canvas area background
		hover: 'rgba(255, 255, 255, 0.06)',
		active: 'rgba(255, 255, 255, 0.1)',
		selected: 'rgba(10, 132, 255, 0.2)', // macOS accent blue
	},

	// Border colors - subtle like macOS
	border: {
		subtle: 'rgba(255, 255, 255, 0.04)',
		default: 'rgba(255, 255, 255, 0.08)',
		strong: 'rgba(255, 255, 255, 0.12)',
		focus: '#0a84ff', // macOS system blue
	},

	// Text colors
	text: {
		primary: '#ffffff',
		secondary: 'rgba(255, 255, 255, 0.7)',
		tertiary: 'rgba(255, 255, 255, 0.5)',
		disabled: 'rgba(255, 255, 255, 0.3)',
		inverse: '#1e1e1e',
	},

	// Brand / Accent colors (macOS system blue)
	accent: {
		primary: '#0a84ff', // macOS system blue
		hover: '#0077ed',
		pressed: '#006edb',
		subtle: 'rgba(10, 132, 255, 0.15)',
	},

	// Semantic colors
	semantic: {
		success: '#1bc47d',
		warning: '#f5a623',
		error: '#f24822',
		info: '#18a0fb',
	},

	// Selection colors
	selection: {
		stroke: '#0a84ff',
		fill: 'rgba(10, 132, 255, 0.15)',
		handle: '#ffffff',
		handleBorder: '#0a84ff',
	},
} as const;

// macOS-style vibrancy effect
export const vibrancy = {
	panel: {
		backgroundColor: 'rgba(28, 28, 30, 0.85)',
		backdropFilter: 'blur(40px) saturate(180%)',
		WebkitBackdropFilter: 'blur(40px) saturate(180%)',
	},
	toolbar: {
		backgroundColor: 'rgba(28, 28, 30, 0.9)',
		backdropFilter: 'blur(20px) saturate(150%)',
		WebkitBackdropFilter: 'blur(20px) saturate(150%)',
	},
} as const;

export const spacing = {
	xs: '4px',
	sm: '8px',
	md: '12px',
	lg: '16px',
	xl: '24px',
	xxl: '32px',
} as const;

export const typography = {
	fontFamily: {
		sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
		mono: '"SF Mono", "Menlo", "Monaco", monospace',
	},
	fontSize: {
		xs: '10px',
		sm: '11px',
		md: '12px',
		lg: '13px',
		xl: '14px',
	},
	fontWeight: {
		regular: 400,
		medium: 500,
		semibold: 600,
	},
	lineHeight: {
		tight: 1.2,
		normal: 1.4,
		relaxed: 1.6,
	},
} as const;

export const radii = {
	none: '0',
	sm: '2px',
	md: '4px',
	lg: '6px',
	xl: '8px',
	full: '9999px',
} as const;

export const shadows = {
	sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
	md: '0 2px 8px rgba(0, 0, 0, 0.4)',
	lg: '0 4px 16px rgba(0, 0, 0, 0.5)',
	xl: '0 8px 32px rgba(0, 0, 0, 0.6)',
	focus: '0 0 0 2px rgba(24, 160, 251, 0.4)',
} as const;

export const transitions = {
	fast: '100ms ease',
	normal: '150ms ease',
	slow: '250ms ease',
} as const;

export const zIndex = {
	base: 0,
	dropdown: 100,
	sticky: 200,
	modal: 300,
	popover: 400,
	tooltip: 500,
	toast: 600,
} as const;

// Panel dimensions
export const panels = {
	left: {
		width: 240,
		collapsedWidth: 40,
		minWidth: 200,
		maxWidth: 400,
	},
	right: {
		width: 240,
		collapsedWidth: 40,
		minWidth: 200,
		maxWidth: 400,
	},
	toolbar: {
		height: 40,
	},
	actionBar: {
		height: 32,
	},
} as const;

// Common component styles
export const componentStyles = {
	// Panel section header
	sectionHeader: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: `${spacing.sm} ${spacing.md}`,
		fontSize: typography.fontSize.sm,
		fontWeight: typography.fontWeight.medium,
		color: colors.text.secondary,
		textTransform: 'uppercase' as const,
		letterSpacing: '0.5px',
		borderBottom: `1px solid ${colors.border.subtle}`,
		userSelect: 'none' as const,
	},

	// Input field
	input: {
		width: '100%',
		height: '28px',
		padding: `0 ${spacing.sm}`,
		backgroundColor: colors.bg.primary,
		border: `1px solid ${colors.border.default}`,
		borderRadius: radii.md,
		fontSize: typography.fontSize.md,
		color: colors.text.primary,
		outline: 'none',
		transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
	},

	// Icon button
	iconButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '28px',
		height: '28px',
		padding: 0,
		backgroundColor: 'transparent',
		border: 'none',
		borderRadius: radii.md,
		color: colors.text.secondary,
		cursor: 'pointer',
		transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
	},

	// Layer row
	layerRow: {
		display: 'flex',
		alignItems: 'center',
		gap: spacing.sm,
		padding: `${spacing.xs} ${spacing.sm}`,
		fontSize: typography.fontSize.md,
		color: colors.text.primary,
		cursor: 'default',
		userSelect: 'none' as const,
		borderRadius: radii.sm,
		transition: `background-color ${transitions.fast}`,
	},

	// Property row
	propertyRow: {
		display: 'flex',
		alignItems: 'center',
		gap: spacing.sm,
		marginBottom: spacing.sm,
	},

	// Property label
	propertyLabel: {
		minWidth: '40px',
		fontSize: typography.fontSize.sm,
		color: colors.text.tertiary,
		flexShrink: 0,
	},
} as const;

// CSS custom properties for runtime theming
export const cssVariables = `
  :root {
    /* Background */
    --bg-primary: ${colors.bg.primary};
    --bg-secondary: ${colors.bg.secondary};
    --bg-tertiary: ${colors.bg.tertiary};
    --bg-canvas: ${colors.bg.canvas};
    --bg-hover: ${colors.bg.hover};
    --bg-active: ${colors.bg.active};
    --bg-selected: ${colors.bg.selected};
    
    /* Border */
    --border-subtle: ${colors.border.subtle};
    --border-default: ${colors.border.default};
    --border-strong: ${colors.border.strong};
    --border-focus: ${colors.border.focus};
    
    /* Text */
    --text-primary: ${colors.text.primary};
    --text-secondary: ${colors.text.secondary};
    --text-tertiary: ${colors.text.tertiary};
    --text-disabled: ${colors.text.disabled};
    
    /* Accent */
    --accent-primary: ${colors.accent.primary};
    --accent-hover: ${colors.accent.hover};
    --accent-pressed: ${colors.accent.pressed};
    
    /* Selection */
    --selection-stroke: ${colors.selection.stroke};
    --selection-fill: ${colors.selection.fill};
    
    /* Spacing */
    --space-xs: ${spacing.xs};
    --space-sm: ${spacing.sm};
    --space-md: ${spacing.md};
    --space-lg: ${spacing.lg};
    --space-xl: ${spacing.xl};
    
    /* Typography */
    --font-sans: ${typography.fontFamily.sans};
    --font-mono: ${typography.fontFamily.mono};
    --font-size-xs: ${typography.fontSize.xs};
    --font-size-sm: ${typography.fontSize.sm};
    --font-size-md: ${typography.fontSize.md};
    --font-size-lg: ${typography.fontSize.lg};
    
    /* Radii */
    --radius-sm: ${radii.sm};
    --radius-md: ${radii.md};
    --radius-lg: ${radii.lg};
    
    /* Shadows */
    --shadow-sm: ${shadows.sm};
    --shadow-md: ${shadows.md};
    --shadow-lg: ${shadows.lg};
    
    /* Transitions */
    --transition-fast: ${transitions.fast};
    --transition-normal: ${transitions.normal};
    
    /* Panels */
    --panel-left-width: ${panels.left.width}px;
    --panel-right-width: ${panels.right.width}px;
    --toolbar-height: ${panels.toolbar.height}px;
  }
`;
