export function deploymentSource(args) {
  const flag = args.find((argument) => argument.startsWith("--source"));
  if (!flag || flag === "--source=cn") return "cn";
  if (flag === "--source=official") return "official";
  throw new Error("Use --source=cn or --source=official");
}
