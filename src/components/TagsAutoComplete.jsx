import { useQuery, useQueryClient } from "@tanstack/react-query";
import AutoComplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

const CUSTOM_TAGS_KEY = ["customTags"];

async function getCustomTags() {
  if (typeof window?.clipx?.getTaglist !== "function") return [];
  const tags = await window.clipx.getTaglist();
  return Array.isArray(tags) ? tags : [];
}

export default function TagsAutoComplete({ options, onChange, saveNewTags = false, ...props }) {
  const queryClient = useQueryClient();
  const { data: customTags = [] } = useQuery({ queryKey: CUSTOM_TAGS_KEY, queryFn: getCustomTags });

  async function updateCustomTags(update) {
    try {
      const tags = update(await getCustomTags());
      await window.clipx.saveTaglist(tags);
      queryClient.setQueryData(CUSTOM_TAGS_KEY, tags);
    } catch (error) {
      console.error("Failed to save custom tags:", error);
    }
  }

  function handleChange(event, newValue, reason, details) {
    const tag = saveNewTags && reason === "createOption" ? details.option.trim() : "";
    if (tag) {
      updateCustomTags((tags) => tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? tags : [...tags, tag]);
    }
    onChange(event, newValue, reason, details);
  }

  return (
    <AutoComplete
      {...props}
      multiple
      filterSelectedOptions
      options={[...options, ...customTags]}
      getOptionKey={(option) => option.id ?? option}
      onChange={handleChange}
      renderOption={({ key, ...optionProps }, option) => (
        <li key={key} {...optionProps}>
          {option.label ?? option}
          {typeof option === "string" && (
            <IconButton
              size="small"
              tabIndex={-1}
              aria-label={`Remove ${option}`}
              sx={{ marginLeft: "auto", padding: "2px" }}
              onClick={(e) => {
                e.stopPropagation();
                updateCustomTags((tags) => tags.filter((t) => t !== option));
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </li>
      )}
    />
  );
}
