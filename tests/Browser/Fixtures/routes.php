<?php

use Illuminate\Support\Facades\Route;

Route::view('/ghostwire-test-page', 'ghostwire-fixtures::page', ['component' => 'demo-table']);

Route::view('/gallery/paginated-table', 'ghostwire-fixtures::page', ['component' => 'paginated-table']);
Route::view('/gallery/grouped-table', 'ghostwire-fixtures::page', ['component' => 'grouped-table']);
Route::view('/gallery/card-grid', 'ghostwire-fixtures::page', ['component' => 'card-grid']);
