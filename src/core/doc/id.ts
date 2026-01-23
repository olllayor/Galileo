let counter = 0;

export const generateId = (): string => {
  counter++;
  return `node_${counter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const resetIdGenerator = (): void => {
  counter = 0;
};

export const generateIdForType = (type: string): string => {
  counter++;
  return `${type}_${counter}_${Date.now()}`;
};
