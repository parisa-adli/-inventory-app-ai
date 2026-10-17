import { X } from 'lucide-react';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_OPTION, USER_SORT_PRESETS, type useUserListParams } from '../hooks/useUserListParams';
import { ROLE_LABELS } from '../roles';

const ROLE_OPTIONS = [
  { value: ALL_OPTION, label: 'All roles' },
  ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

const VERIFIED_OPTIONS = [
  { value: ALL_OPTION, label: 'Any email status' },
  { value: 'true', label: 'Verified' },
  { value: 'false', label: 'Not verified' },
];

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full lg:w-44" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Search, role, email status and "Sort by" on one row, plus "Clear filters" while any filter is set (DESIGN.md §5). */
export function UsersToolbar({ list }: { list: ReturnType<typeof useUserListParams> }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <SearchInput value={list.search} onSearch={list.setSearch} placeholder="Search name or email…" />
      <FilterSelect label="Role" value={list.role} onChange={list.setRole} options={ROLE_OPTIONS} />
      <FilterSelect label="Email status" value={list.verified} onChange={list.setVerified} options={VERIFIED_OPTIONS} />
      <FilterSelect
        label="Sort by"
        value={list.sortPreset}
        onChange={list.setSortPreset}
        options={USER_SORT_PRESETS}
      />
      {list.hasFilters && (
        <Button variant="ghost" onClick={list.clearFilters}>
          <X className="size-4" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
