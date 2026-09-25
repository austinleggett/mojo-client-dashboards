"use client";

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Drag-and-drop reordering, used two ways in Dashboard.js: reordering
// the dashboard's top-level sections, and reordering items within any
// list (stats, momentum cards, store cards, review items, etc). Both
// go through this one component -- give the list a stable id prefix,
// tell it how to render one item's inner content, and it handles the
// rest (including falling back to plain, undraggable markup outside of
// edit mode, since useSortable can't run outside a DndContext).
//
// `items` is the current array (of anything); `onReorder(fromIndex,
// toIndex)` is called with the drag result -- the caller is
// responsible for actually moving the item in its own state (usually
// arrayMove on the relevant content path).
export function SortableGroup({
  idPrefix,
  items,
  onReorder,
  disabled,
  as: ListTag = "div",
  listClassName,
  rowAs: RowTag = "div",
  rowClassName,
  children,
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = items.map((_, i) => `${idPrefix}::${i}`);
  const rowClass = (item, i) => (typeof rowClassName === "function" ? rowClassName(item, i) : rowClassName);

  if (disabled) {
    return (
      <ListTag className={listClassName}>
        {items.map((item, i) => (
          <RowTag key={i} className={rowClass(item, i)}>
            {children(item, i)}
          </RowTag>
        ))}
      </ListTag>
    );
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from === -1 || to === -1 || from === to) return;
    onReorder(from, to);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ListTag className={listClassName}>
          {items.map((item, i) => (
            <SortableRow key={ids[i]} id={ids[i]} as={RowTag} className={rowClass(item, i)}>
              {children(item, i)}
            </SortableRow>
          ))}
        </ListTag>
      </SortableContext>
    </DndContext>
  );
}

// A single draggable row/card. Only the grip handle inside it is the
// actual drag listener target, so dragging doesn't fight with clicking
// buttons or editing text elsewhere in the row.
function SortableRow({ id, as: Tag = "div", className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
  };
  return (
    <Tag ref={setNodeRef} style={style} className={className}>
      <button type="button" className="drag-handle edit-ctl" aria-label="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </button>
      {children}
    </Tag>
  );
}

export { arrayMove };
