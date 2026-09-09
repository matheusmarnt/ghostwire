<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Ghostwire test fixture</title>
    @ghostwireStyles($nonce ?? null)
</head>
<body>
    <main>
        <h1>Ghostwire test fixture</h1>
        @livewire($component)
    </main>
    @livewireScripts
    @ghostwireScripts($nonce ?? null)
</body>
</html>
