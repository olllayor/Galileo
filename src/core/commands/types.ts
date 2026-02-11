import type {
	Asset,
	BooleanOp,
	ComponentDefinition,
	DocumentAppearance,
	ComponentOverridePatch,
	ComponentSet,
	ComponentVariantMap,
	EffectStyle,
	GridStyle,
	Node,
	PaintStyle,
	PrototypeInteraction,
	StyleVariableCollection,
	StyleVariableToken,
	TextStyle,
} from '../doc/types';

export interface BaseCommand {
	id: string;
	timestamp: number;
	source: 'user' | 'ai';
	description?: string;
	selectionSnapshot?: string[];
}

export interface CreateNodeCommand extends BaseCommand {
	type: 'createNode';
	payload: {
		id: string;
		parentId: string;
		node: Omit<Node, 'id' | 'children'>;
		index?: number;
	};
}

export interface DeleteNodeCommand extends BaseCommand {
	type: 'deleteNode';
	payload: {
		id: string;
	};
}

export interface MoveNodeCommand extends BaseCommand {
	type: 'moveNode';
	payload: {
		id: string;
		position: { x: number; y: number };
	};
}

export interface ResizeNodeCommand extends BaseCommand {
	type: 'resizeNode';
	payload: {
		id: string;
		size: { width: number; height: number };
	};
}

export interface SetPropsCommand extends BaseCommand {
	type: 'setProps';
	payload: {
		id: string;
		props: Partial<Node>;
	};
}

export interface ReorderChildCommand extends BaseCommand {
	type: 'reorderChild';
	payload: {
		parentId: string;
		fromIndex: number;
		toIndex: number;
	};
}

export interface CreateAssetCommand extends BaseCommand {
	type: 'createAsset';
	payload: {
		id: string;
		asset: Asset;
	};
}

export interface GroupNodesCommand extends BaseCommand {
	type: 'groupNodes';
	payload: {
		groupId: string;
		nodeIds: string[];
		parentId: string;
		insertIndex: number;
	};
}

export interface UngroupNodesCommand extends BaseCommand {
	type: 'ungroupNodes';
	payload: {
		groupId: string;
	};
}

export interface BatchCommand extends BaseCommand {
	type: 'batch';
	payload: {
		commands: Command[];
	};
}

export interface CreatePageCommand extends BaseCommand {
	type: 'createPage';
	payload: {
		pageId: string;
		name: string;
		rootId: string;
		index?: number;
		activate?: boolean;
		rootNode?: Omit<Node, 'id'>;
	};
}

export interface RenamePageCommand extends BaseCommand {
	type: 'renamePage';
	payload: {
		pageId: string;
		name: string;
	};
}

export interface ReorderPageCommand extends BaseCommand {
	type: 'reorderPage';
	payload: {
		fromIndex: number;
		toIndex: number;
	};
}

export interface DeletePageCommand extends BaseCommand {
	type: 'deletePage';
	payload: {
		pageId: string;
		fallbackPageId?: string;
	};
}

export interface SetPrototypeStartFrameCommand extends BaseCommand {
	type: 'setPrototypeStartFrame';
	payload: {
		pageId: string;
		frameId?: string;
	};
}

export interface SetPrototypeInteractionCommand extends BaseCommand {
	type: 'setPrototypeInteraction';
	payload: {
		pageId: string;
		sourceFrameId: string;
		trigger: 'click' | 'hover';
		interaction?: PrototypeInteraction;
	};
}

export interface CreateBooleanNodeCommand extends BaseCommand {
	type: 'createBooleanNode';
	payload: {
		id: string;
		parentId: string;
		operandIds: string[];
		op: BooleanOp;
		index?: number;
		tolerance?: number;
	};
}

export interface SetBooleanOpCommand extends BaseCommand {
	type: 'setBooleanOp';
	payload: {
		id: string;
		op: BooleanOp;
	};
}

export interface SetBooleanIsolationCommand extends BaseCommand {
	type: 'setBooleanIsolation';
	payload: {
		id: string;
		isolationOperandId?: string;
	};
}

export interface FlattenBooleanNodeCommand extends BaseCommand {
	type: 'flattenBooleanNode';
	payload: {
		id: string;
	};
}

export interface AddVectorPointCommand extends BaseCommand {
	type: 'addVectorPoint';
	payload: {
		id: string;
		point: {
			id?: string;
			x: number;
			y: number;
			cornerMode?: 'sharp' | 'mirrored' | 'asymmetric' | 'disconnected';
		};
		afterPointId?: string;
	};
}

export interface MoveVectorPointCommand extends BaseCommand {
	type: 'moveVectorPoint';
	payload: {
		id: string;
		pointId: string;
		x: number;
		y: number;
	};
}

export interface DeleteVectorPointCommand extends BaseCommand {
	type: 'deleteVectorPoint';
	payload: {
		id: string;
		pointId: string;
	};
}

export interface SetVectorHandleCommand extends BaseCommand {
	type: 'setVectorHandle';
	payload: {
		id: string;
		pointId: string;
		handle: 'in' | 'out';
		value?: { x: number; y: number };
	};
}

export interface ToggleVectorClosedCommand extends BaseCommand {
	type: 'toggleVectorClosed';
	payload: {
		id: string;
		closed: boolean;
	};
}

export interface CreateComponentDefinitionCommand extends BaseCommand {
	type: 'createComponentDefinition';
	payload: {
		definition: ComponentDefinition;
	};
}

export interface UpdateComponentDefinitionCommand extends BaseCommand {
	type: 'updateComponentDefinition';
	payload: {
		id: string;
		updates: Partial<ComponentDefinition>;
	};
}

export interface CreateOrUpdateComponentSetCommand extends BaseCommand {
	type: 'createOrUpdateComponentSet';
	payload: {
		set: ComponentSet;
	};
}

export interface InsertComponentInstanceCommand extends BaseCommand {
	type: 'insertComponentInstance';
	payload: {
		id: string;
		parentId: string;
		componentId: string;
		name?: string;
		variant?: ComponentVariantMap;
		position?: { x: number; y: number };
		index?: number;
		isMainPreview?: boolean;
	};
}

export interface SetComponentInstanceVariantCommand extends BaseCommand {
	type: 'setComponentInstanceVariant';
	payload: {
		id: string;
		variant: ComponentVariantMap;
	};
}

export interface SetComponentInstanceOverrideCommand extends BaseCommand {
	type: 'setComponentInstanceOverride';
	payload: {
		id: string;
		sourceNodeId: string;
		patch?: Partial<ComponentOverridePatch>;
		reset?: boolean;
	};
}

export interface DetachComponentInstanceCommand extends BaseCommand {
	type: 'detachComponentInstance';
	payload: {
		id: string;
	};
}

export type SharedStyleKind = 'paint' | 'text' | 'effect' | 'grid';
export type SharedStylePayloadByKind = {
	paint: PaintStyle;
	text: TextStyle;
	effect: EffectStyle;
	grid: GridStyle;
};
type UpsertSharedStylePayload = {
	[K in SharedStyleKind]: {
		kind: K;
		style: SharedStylePayloadByKind[K];
	};
}[SharedStyleKind];

export interface UpsertSharedStyleCommand extends BaseCommand {
	type: 'upsertSharedStyle';
	payload: UpsertSharedStylePayload;
}

export interface RemoveSharedStyleCommand extends BaseCommand {
	type: 'removeSharedStyle';
	payload: {
		kind: SharedStyleKind;
		id: string;
	};
}

export interface UpsertVariableCollectionCommand extends BaseCommand {
	type: 'upsertVariableCollection';
	payload: {
		collection: StyleVariableCollection;
	};
}

export interface RemoveVariableCollectionCommand extends BaseCommand {
	type: 'removeVariableCollection';
	payload: {
		collectionId: string;
	};
}

export interface UpsertVariableTokenCommand extends BaseCommand {
	type: 'upsertVariableToken';
	payload: {
		token: StyleVariableToken;
	};
}

export interface RemoveVariableTokenCommand extends BaseCommand {
	type: 'removeVariableToken';
	payload: {
		tokenId: string;
	};
}

export interface SetVariableCollectionModeCommand extends BaseCommand {
	type: 'setVariableCollectionMode';
	payload: {
		collectionId: string;
		modeId: string;
	};
}

export interface SetDocumentAppearanceCommand extends BaseCommand {
	type: 'setDocumentAppearance';
	payload: {
		appearance: DocumentAppearance;
	};
}

export type Command =
	| CreateNodeCommand
	| DeleteNodeCommand
	| MoveNodeCommand
	| ResizeNodeCommand
	| SetPropsCommand
	| ReorderChildCommand
	| CreateAssetCommand
	| GroupNodesCommand
	| UngroupNodesCommand
	| BatchCommand
	| CreatePageCommand
	| RenamePageCommand
	| ReorderPageCommand
	| DeletePageCommand
	| SetPrototypeStartFrameCommand
	| SetPrototypeInteractionCommand
	| CreateBooleanNodeCommand
	| SetBooleanOpCommand
	| SetBooleanIsolationCommand
	| FlattenBooleanNodeCommand
	| AddVectorPointCommand
	| MoveVectorPointCommand
	| DeleteVectorPointCommand
	| SetVectorHandleCommand
	| ToggleVectorClosedCommand
	| CreateComponentDefinitionCommand
	| UpdateComponentDefinitionCommand
	| CreateOrUpdateComponentSetCommand
	| InsertComponentInstanceCommand
	| SetComponentInstanceVariantCommand
	| SetComponentInstanceOverrideCommand
	| DetachComponentInstanceCommand
	| UpsertSharedStyleCommand
	| RemoveSharedStyleCommand
	| UpsertVariableCollectionCommand
	| RemoveVariableCollectionCommand
	| UpsertVariableTokenCommand
	| RemoveVariableTokenCommand
	| SetVariableCollectionModeCommand
	| SetDocumentAppearanceCommand;

export const isCommand = (value: unknown): value is Command => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const cmd = value as Command;
	return (
		typeof cmd.id === 'string' &&
		typeof cmd.timestamp === 'number' &&
		typeof cmd.source === 'string' &&
		typeof cmd.type === 'string'
	);
};
