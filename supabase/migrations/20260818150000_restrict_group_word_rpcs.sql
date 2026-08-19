revoke all on function public.add_group_word(text) from anon;
revoke all on function public.get_my_group_word_count() from anon;
revoke all on function public.list_my_group_words() from anon;
revoke all on function public.delete_my_group_word(uuid) from anon;

grant execute on function public.add_group_word(text) to authenticated;
grant execute on function public.get_my_group_word_count() to authenticated;
grant execute on function public.list_my_group_words() to authenticated;
grant execute on function public.delete_my_group_word(uuid) to authenticated;