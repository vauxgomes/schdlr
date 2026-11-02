/** Com usuário, o nome é sempre o do usuário; o `name` guardado vale para a vaga. */
export const teacherName = ({ name, user }: { name: string; user: { name: string } | null }) =>
  user?.name ?? name
