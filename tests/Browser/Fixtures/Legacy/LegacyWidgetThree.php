<?php

// tests/Browser/Fixtures/Legacy/LegacyWidgetThree.php

namespace Ghostwire\Tests\Browser\Fixtures\Legacy;

class LegacyWidgetThree extends LegacyBaseComponent
{
    public function render()
    {
        return view('ghostwire-fixtures::legacy.legacy-widget-three');
    }

    public function refreshBadge(): void {}
}
