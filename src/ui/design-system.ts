/**
 * Galileo Design System - Native macOS-inspired design tokens
 *
 * This system provides consistent styling across the application,
 * using Apple's Human Interface Guidelines as reference.
 */

export const colors = {
	// Background colors - macOS dark mode inspired
	bg: {
		primary: '#1e1e1e', // Main app background
		secondary: '#252526', // Panel backgrounds
		tertiary: '#2d2d2d', // Elevated surfaces
		canvas: '#1a1a1a', // Canvas area background
		hover: 'rgba(255, 255, 255, 0.05)',
		active: 'rgba(255, 255, 255, 0.08)',
		selected: 'rgba(10, 132, 255, 0.15)', // macOS blue selection
	},

	// Border colors
	border: {
		subtle: 'rgba(255, 255, 255, 0.06)',
		default: 'rgba(255, 255, 255, 0.1)',
		strong: 'rgba(255, 255, 255, 0.15)',
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
		pressed: '#006adb',
		subtle: 'rgba(10, 132, 255, 0.1)',
	},

	// Semantic colors - macOS system colors
	semantic: {
		success: '#30d158', // macOS green
		warning: '#ff9f0a', // macOS orange
		error: '#ff453a', // macOS red
		info: '#0a84ff', // macOS blue
	},

	// Selection colors
	selection: {
		stroke: '#0a84ff',
		fill: 'rgba(10, 132, 255, 0.1)',
		handle: '#ffffff',
		handleBorder: '#0a84ff',
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
		sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif',
		mono: '"SF Mono", "Menlo", "Monaco", Consolas, monospace',
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
	sm: '0 1px 3px rgba(0, 0, 0, 0.25)',
	md: '0 4px 12px rgba(0, 0, 0, 0.35)',
	lg: '0 8px 24px rgba(0, 0, 0, 0.45)',
	xl: '0 12px 40px rgba(0, 0, 0, 0.55)',
	focus: '0 0 0 3px rgba(10, 132, 255, 0.35)', // macOS-style focus ring
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
