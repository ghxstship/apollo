/* The kit's public surface. Every component here, and every props type beside
   it: a consumer that wraps a Button, forwards a Table's columns or stores a
   Toast's props in state had nothing to name but `React.ComponentProps<typeof
   X>`, which is the props type spelled the long way round and breaks the
   moment a component becomes generic.

   Nothing is re-exported under a different name. `PassageLog as KitPassageLog`
   used to be, to dodge a collision with the member record of the same name,
   and the alias leaked: every call site imported a name that no file declares.
   The primitive is `FigureGrid` now — what it renders — and the collision is
   gone rather than renamed around. */

export { Button, IconButton, LinkButton, TextButton, ThemeToggle, applyTheme } from "./actions";
export type { ButtonProps, IconButtonProps, LinkButtonProps, TextButtonProps, ThemeToggleProps } from "./actions";

export { cx, buttonClass } from "./class";
export type { ClassPart, ButtonBase, ButtonClassOptions } from "./class";

export { Bdi, Card, Badge, Tag, Avatar, AvatarGroup, Stat, Table, tableColumns, ReviewList, ReviewRow, Wordmark, LockupText, Icon } from "./display";
export type {
  CardProps, CardMedia, CardSea, BadgeProps, TagProps, AvatarProps, AvatarGroupProps, StatProps,
  TableColumn, TableGroup, TableProps, ReviewListProps, ReviewRowProps,
  WordmarkProps, DivisionSuffix, LockupTextProps, IconProps, IconName, IconSize,
} from "./display";

export { Input, Textarea, Select, SearchField, Checkbox, Radio, OptionRow, Switch, Stepper } from "./forms";
export type {
  FieldWidth, InputProps, TextareaProps, SelectProps, SearchFieldProps,
  CheckboxProps, RadioProps, OptionRowProps, SwitchProps, StepperProps,
} from "./forms";

export { Dialog, Progress, Skeleton, StateBlock, Notice, Toast, Tooltip } from "./feedback";
export type {
  DialogProps, ProgressProps, SkeletonProps, StateBlockProps, NoticeProps, ToastProps, TooltipProps,
} from "./feedback";

export { FilterPills } from "./filters";
export type { FilterOption, FilterPillsProps } from "./filters";

export { ListToolbar } from "./toolbar";
export type { SortOption, ToolbarChip, ListToolbarProps } from "./toolbar";

export { Tabs } from "./navigation";
export type { TabItem, TabsProps } from "./navigation";

export { FigureGrid, MarksList, ContestCard, StandingsTable, KnotsLedger } from "./logbook";
export type {
  LogFigure, FigureGridProps, MarkItem, MarksListProps, ContestCardProps,
  StandingsEntry, StandingsTableProps, LedgerEntry, LedgerReward, KnotsLedgerProps,
} from "./logbook";

export { PostCard, Hail, CommentThread, Composer, FlagButton, FlagQueue } from "./feed";
export type {
  PostCardProps, HailProps, FeedComment, CommentThreadProps, ComposerProps,
  FlagButtonProps, FlagItem, FlagQueueProps,
} from "./feed";

export { useExitPhase } from "./use-exit-phase";
export { useModal } from "./use-modal";
export { useMounted, useClientSnapshot } from "./use-mounted";
