export async function wait(ms: number) {
  return new Promise(function (res) {
    setTimeout(res, ms);
  });
}
